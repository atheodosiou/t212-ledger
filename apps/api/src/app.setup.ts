import {
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './config/env.js';

/** Everything main.ts applies to the app, shared with the integration tests so they test the real thing. */
export function configureApp(app: INestApplication): void {
  // First, so every response (errors from later middleware included) carries the headers.
  app.useSecurityHeaders();
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }) });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
}
