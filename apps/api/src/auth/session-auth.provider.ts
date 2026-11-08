import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  SessionCookieProvider,
  type SessionRecord,
} from '@nestjs/authentication';
import type { AppUser } from './auth.types.js';

/** The session cookie. The user is read in the same query as the session (DrizzleAuthStore). */
@Injectable()
export class SessionAuth extends SessionCookieProvider<AppUser> {
  constructor(registry: AuthenticationRegistry) {
    super();
    registry.registerProvider(this);
  }

  /** `null` (the user was deleted) ends the session. */
  protected validate(session: SessionRecord): AppUser | null {
    return session.extra?.user ?? null;
  }
}
