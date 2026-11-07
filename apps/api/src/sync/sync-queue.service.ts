import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, ne } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import type { Env } from '../config/env.js';
import type { Db } from '../db/db.js';
import { brokerAccounts } from '../db/schema.js';
import { HistorySyncService } from './history-sync.service.js';

const QUEUE = 'account-sync';

interface SyncJob {
  accountId: string;
  full: boolean;
}

/** Background sync jobs, stored in the same Postgres. At most one queued + one running job per account. */
@Injectable()
export class SyncQueueService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SyncQueueService.name);
  private readonly boss: PgBoss;

  constructor(
    config: ConfigService<Env, true>,
    @InjectDrizzle() private readonly db: Db,
    private readonly sync: HistorySyncService,
  ) {
    this.boss = new PgBoss(config.get('DATABASE_URL', { infer: true }));
    this.boss.on('error', (error) => this.logger.error(error));
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start();
    // A full first sync of a long history can spend a while waiting out rate limits.
    await this.boss.createQueue(QUEUE, { policy: 'stately', expireInSeconds: 4 * 60 * 60, retryLimit: 2 });
    await this.boss.work<SyncJob>(QUEUE, async ([job]) => {
      await this.sync.run(job.data.accountId, job.data.full, job.signal);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: true });
  }

  /** Returns false when a sync for this account is already queued. */
  async enqueue(accountId: string, full: boolean): Promise<boolean> {
    const jobId = await this.boss.send(QUEUE, { accountId, full } satisfies SyncJob, { singletonKey: accountId });
    if (!jobId) return false;
    await this.db
      .update(brokerAccounts)
      .set({ syncStatus: 'QUEUED' })
      .where(and(eq(brokerAccounts.id, accountId), ne(brokerAccounts.syncStatus, 'RUNNING')));
    return true;
  }
}
