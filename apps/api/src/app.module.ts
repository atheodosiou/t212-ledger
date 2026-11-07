import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AccountsController } from './accounts/accounts.controller.js';
import { AccountsService } from './accounts/accounts.service.js';
import { validateEnv, type Env } from './config/env.js';
import { EncryptionService } from './crypto/encryption.service.js';
import { InstrumentsService } from './trading212/instruments.service.js';
import { ExportService } from './export/export.service.js';
import * as schema from './db/schema.js';
import { LedgerService } from './ledger/ledger.service.js';
import { HistorySyncService } from './sync/history-sync.service.js';
import { SyncQueueService } from './sync/sync-queue.service.js';
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
  ],
  controllers: [AccountsController],
  providers: [
    EncryptionService,
    AccountsService,
    LedgerService,
    InstrumentsService,
    ExportService,
    HistorySyncService,
    SyncQueueService,
    DevUserGuard,
  ],
})
export class AppModule {}
