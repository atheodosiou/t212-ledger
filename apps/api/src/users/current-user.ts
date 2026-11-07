import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Env } from '../config/env.js';
import type { Db } from '../db/db.js';
import { users } from '../db/schema.js';

export interface CurrentUserData {
  id: string;
  email: string;
}

/**
 * TEMPORARY single-user mode: every request runs as DEV_USER_EMAIL.
 * Replace with real sign-in (Google / magic link) before any public deployment.
 */
@Injectable()
export class DevUserGuard implements CanActivate {
  private cached: CurrentUserData | null = null;

  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const email = this.config.get('DEV_USER_EMAIL', { infer: true });
    if (!email) throw new UnauthorizedException('Sign-in is not implemented yet; set DEV_USER_EMAIL');

    if (!this.cached) {
      const [row] = await this.db
        .insert(users)
        .values({ email })
        .onConflictDoUpdate({ target: users.email, set: { email } })
        .returning({ id: users.id, email: users.email });
      this.cached = row;
    }
    context.switchToHttp().getRequest<{ user?: CurrentUserData }>().user = this.cached;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): CurrentUserData => {
  const user = ctx.switchToHttp().getRequest<{ user?: CurrentUserData }>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});
