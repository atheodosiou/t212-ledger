import { StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

const app = await NestFactory.create(AppModule);
const config = app.get<ConfigService<Env, true>>(ConfigService);

app.setGlobalPrefix('api');
app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }) });
app.useGlobalPipes(new StandardSchemaValidationPipe());
app.enableShutdownHooks();

await app.listen(config.get('PORT', { infer: true }), config.get('HOST', { infer: true }));
