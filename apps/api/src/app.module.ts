import { Module } from '@nestjs/common';
import { AuthenticationModule, google } from '@nestjs/authentication';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { DrizzleModule } from '@nestjs/drizzle';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AccountsController } from './accounts/accounts.controller.js';
import { AccountsService } from './accounts/accounts.service.js';
import { RequestLogInterceptor } from './common/request-log.interceptor.js';
import { AuthController } from './auth/auth.controller.js';
import { DrizzleAuthStore } from './auth/drizzle-auth.store.js';
import { GoogleAccountResolver } from './auth/google-account.resolver.js';
import { SessionAuth } from './auth/session-auth.provider.js';
import { oidcCallbackUrl, validateEnv, type Env } from './config/env.js';
import { EncryptionService } from './crypto/encryption.service.js';
import * as schema from './db/schema.js';
import { ExportService } from './export/export.service.js';
import { ExportsService } from './exports/exports.service.js';
import { HealthController } from './health/health.controller.js';
import { LedgerService } from './ledger/ledger.service.js';
import { PortfolioService } from './portfolio/portfolio.service.js';
import { ReconciliationService } from './reconciliation/reconciliation.service.js';
import { HistorySyncService } from './sync/history-sync.service.js';
import { SyncQueueService } from './sync/sync-queue.service.js';
import { InstrumentsService } from './trading212/instruments.service.js';
import { MeController } from './users/me.controller.js';
import { TaxController } from './tax/tax.controller.js';
import { TaxService } from './tax/tax.service.js';
import { YearController } from './year/year.controller.js';
import { YearService } from './year/year.service.js';
import { UserDataService } from './users/user-data.service.js';
import { UsersService } from './users/users.service.js';

@Module({
  imports: [
    // Only the process environment: scripts pass --env-file explicitly, and tests must never
    // pick up a developer's .env (real keys).
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        drizzle,
        connection: config.get('DATABASE_URL', { infer: true }),
        schema,
      }),
    }),
    // Every route requires a signed-in user unless marked @Public().
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const webOrigin = config.get('WEB_ORIGIN', { infer: true });
        const clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
        const clientSecret = config.get('GOOGLE_CLIENT_SECRET', {
          infer: true,
        });
        return {
          session: {
            absoluteTtl: '30d',
            idleTtl: '7d',
            // The web app's origin: in development the Angular dev server proxies /api.
            trustedOrigins: [webOrigin],
            metadata: (request) => ({
              userAgent: String(request.headers['user-agent'] ?? '').slice(
                0,
                200,
              ),
            }),
          },
          ...(clientId && clientSecret
            ? {
                oidc: {
                  callbackUrl: oidcCallbackUrl(webOrigin),
                  providers: { google: google({ clientId, clientSecret }) },
                  redirectAfterLogin: '/',
                },
              }
            : {}),
        };
      },
    }),
    // Generous default for the UI (polling, lazy tables); tighter limits on routes
    // that call Trading 212 or do heavy work are set with @Throttle on the route.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] }),
  ],
  controllers: [
    AccountsController,
    AuthController,
    HealthController,
    MeController,
    TaxController,
    YearController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestLogInterceptor },
    EncryptionService,
    AccountsService,
    LedgerService,
    InstrumentsService,
    ExportService,
    ExportsService,
    PortfolioService,
    ReconciliationService,
    HistorySyncService,
    SyncQueueService,
    DrizzleAuthStore,
    SessionAuth,
    GoogleAccountResolver,
    UsersService,
    UserDataService,
    TaxService,
    YearService,
  ],
})
export class AppModule {}
