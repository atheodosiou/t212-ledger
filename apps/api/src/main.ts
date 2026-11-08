import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.js';

const app = await NestFactory.create(AppModule, {
  // JSON lines for log collectors in production; readable text in development.
  logger: new ConsoleLogger({ json: process.env.LOG_FORMAT === 'json' }),
});
configureApp(app);

const config = app.get<ConfigService<Env, true>>(ConfigService);
await app.listen(
  config.get('PORT', { infer: true }),
  config.get('HOST', { infer: true }),
);
