import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  OidcAccountResolver,
  type OidcProfile,
} from '@nestjs/authentication';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { UsersService } from '../users/users.service.js';
import type { AppUser } from './auth.types.js';

/**
 * Maps a Google identity to a user (see UsersService.resolveIdentity). Registered only
 * when Google is configured: the module requires the `oidc` option and this handler together.
 */
@Injectable()
export class GoogleAccountResolver extends OidcAccountResolver {
  constructor(
    private readonly users: UsersService,
    config: ConfigService<Env, true>,
    registry: AuthenticationRegistry,
  ) {
    super();
    if (config.get('GOOGLE_CLIENT_ID', { infer: true })) {
      registry.registerHandler('oidc', this);
    }
  }

  resolveUser(profile: OidcProfile): Promise<AppUser> {
    return this.users.resolveIdentity(profile);
  }
}
