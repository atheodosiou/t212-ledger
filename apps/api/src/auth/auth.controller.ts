import {
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Redirect,
  Res,
} from '@nestjs/common';
import {
  Authenticate,
  CurrentUser,
  OidcService,
  Public,
  SignInService,
} from '@nestjs/authentication';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Env } from '../config/env.js';
import { SignInRefusedError, UsersService } from '../users/users.service.js';
import type { AppUser } from './auth.types.js';

/** Sign-in methods the login page offers. */
export interface AuthConfig {
  google: boolean;
  /** Set in development only: the address of the "Sign in as" button. */
  devUser: string | null;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly oidc: OidcService,
    private readonly signIns: SignInService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Get('config')
  authConfig(): AuthConfig {
    return {
      google: !!this.config.get('GOOGLE_CLIENT_ID', { infer: true }),
      devUser: this.config.get('DEV_USER_EMAIL', { infer: true }) ?? null,
    };
  }

  /** The signed-in user; 401 otherwise (the web app then shows the sign-in page). */
  @Get('me')
  me(@CurrentUser() user: AppUser): AppUser {
    return user;
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('oidc/:provider/login')
  @Redirect()
  login(
    @Param('provider') provider: string,
    @Query('redirectTo') redirectTo?: string,
  ) {
    return this.oidc.start(provider, { redirectTo });
  }

  /**
   * Google sends the browser back here. Any failure goes back to the sign-in page with
   * a reason the page can explain, instead of a JSON error in the browser.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('oidc/:provider/callback')
  @Redirect()
  async callback(
    @Param('provider') provider: string,
    @Query() query: Record<string, string>,
  ) {
    try {
      return await this.oidc.finish(provider, query);
    } catch (error) {
      const reason =
        error instanceof SignInRefusedError
          ? error.reason
          : query.error === 'access_denied'
            ? 'cancelled'
            : 'failed';
      if (reason === 'failed') {
        this.logger.warn(
          `Sign-in with ${provider} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return { url: `/login?error=${reason}` };
    }
  }

  /** DEV_USER_EMAIL only (never in production): signs in without Google. */
  @Public()
  @Post('dev-login')
  @HttpCode(204)
  async devLogin(): Promise<void> {
    const email = this.config.get('DEV_USER_EMAIL', { infer: true });
    if (!email || this.config.get('NODE_ENV', { infer: true }) === 'production')
      throw new NotFoundException();
    const user = await this.users.devUser(email);
    await this.signIns.signIn(user.id, { method: 'dev' });
  }

  @Authenticate({ optional: true })
  @Post('logout')
  @HttpCode(204)
  async logout(@Res({ passthrough: true }) res: Response): Promise<void> {
    await this.signIns.signOut();
    res.setHeader('Clear-Site-Data', '"cache"');
  }

  @Post('logout-everywhere')
  @HttpCode(204)
  async logoutEverywhere(@CurrentUser() user: AppUser): Promise<void> {
    await this.signIns.signOutEverywhere(user.id);
  }
}
