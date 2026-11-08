import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { DrizzleModule } from '@nestjs/drizzle';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AccountsController } from './accounts/accounts.controller.js';
import { AccountsService } from './accounts/accounts.service.js';
import { RequestLogInterceptor } from './common/request-log.interceptor.js';
import { validateEnv, type Env } from './config/env.js';
import { EncryptionService } from './crypto/encryption.service.js';
import * as schema from './db/schema.js';
import { ExportService } from './export/export.service.js';
import { HealthController } from './health/health.controller.js';
import { LedgerService } from './ledger/ledger.service.js';
import { PortfolioService } from './portfolio/portfolio.service.js';
import { ReconciliationService } from './reconciliation/reconciliation.service.js';
import { HistorySyncService } from './sync/history-sync.service.js';
import { SyncQueueService } from './sync/sync-queue.service.js';
import { InstrumentsService } from './trading212/instruments.service.js';
import { DevUserGuard } from './users/current-user.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        drizzle,
        connection: config.get('DATABASE_URL', { infer: true }),
        schema,
      }),
    }),
    // Generous default for the UI (polling, lazy tables); tighter limits on routes
    // that call Trading 212 or do heavy work are set with @Throttle on the route.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] }),
  ],
  controllers: [AccountsController, HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestLogInterceptor },
    EncryptionService,
    AccountsService,
    LedgerService,
    InstrumentsService,
    ExportService,
    PortfolioService,
    ReconciliationService,
    HistorySyncService,
    SyncQueueService,
    DevUserGuard,
  ],
})
export class AppModule {}
