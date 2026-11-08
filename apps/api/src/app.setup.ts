import {
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env.js';

/** Everything main.ts applies to the app, shared with the integration tests so they test the real thing. */
export function configureApp(app: INestApplication): void {
  // First, so every response (errors from later middleware included) carries the headers.
  app.useSecurityHeaders();
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });
  app.setGlobalPrefix('api');
  // Same origin as the web app (Nginx in production, the dev server proxy locally),
  // so no CORS. Session cookies are ignored on writes from any other origin.
  app.enableCsrfProtection({ trustedOrigins: [webOrigin] });
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy) {
    // Behind Nginx: the client address (rate limits, logs) comes from X-Forwarded-For.
    (app as NestExpressApplication).set('trust proxy', trustProxy);
  }
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
}
