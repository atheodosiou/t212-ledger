import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import type { Env } from '../config/env.js';
import type { Db } from '../db/db.js';
import { brokerAccounts } from '../db/schema.js';
import { ExportsService } from '../exports/exports.service.js';
import { HistorySyncService } from './history-sync.service.js';

const QUEUE = 'account-sync';
const EXPORT_QUEUE = 'account-export';
/** Job states in which pg-boss will still run the job. */
const LIVE_STATES = new Set(['created', 'retry', 'active']);

interface SyncJob {
  accountId: string;
  full: boolean;
}

/** Background sync jobs, stored in the same Postgres. At most one queued + one running job per account. */
@Injectable()
export class SyncQueueService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SyncQueueService.name);
  private readonly boss: PgBoss;

  constructor(
    config: ConfigService<Env, true>,
    @InjectDrizzle() private readonly db: Db,
    private readonly sync: HistorySyncService,
    private readonly exports: ExportsService,
  ) {
    this.boss = new PgBoss(config.get('DATABASE_URL', { infer: true }));
    this.boss.on('error', (error) => this.logger.error(error));
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start();
    // A full first sync of a long history can spend a while waiting out rate limits.
    await this.boss.createQueue(QUEUE, {
      policy: 'stately',
      expireInSeconds: 4 * 60 * 60,
      retryLimit: 2,
    });
    // Fetching Trading 212's CSV export takes minutes (it is built on request), so it runs
    // after the sync, on its own, and never holds the sync up.
    await this.boss.createQueue(EXPORT_QUEUE, {
      policy: 'stately',
      expireInSeconds: 2 * 60 * 60,
      retryLimit: 1,
    });
    await this.boss.work<SyncJob>(QUEUE, async ([job]) => {
      await this.sync.run(job.data.accountId, job.data.full, job.signal);
      await this.enqueueExport(job.data.accountId);
    });
    await this.boss.work<{ accountId: string }>(EXPORT_QUEUE, async ([job]) => {
      await this.exports.run(job.data.accountId, job.signal);
    });
    await this.recoverInterrupted();
    this.started = true;
  }

  async onApplicationShutdown(): Promise<void> {
    this.started = false;
    await this.boss.stop({ graceful: true });
  }

  private started = false;

  /** For the health check: the worker is running and the queue answers. */
  async healthy(): Promise<boolean> {
    if (!this.started) return false;
    return (await this.boss.getQueue(QUEUE)) !== null;
  }

  /**
   * An account can be left marked QUEUED or RUNNING when the process stopped mid-sync
   * and no job is left to finish it (e.g. retries used up, or a job from before
   * heartbeats). Queue it again: the sync resumes where it stopped.
   */
  private async recoverInterrupted(): Promise<void> {
    const stuck = await this.db
      .select({ id: brokerAccounts.id })
      .from(brokerAccounts)
      .where(inArray(brokerAccounts.syncStatus, ['QUEUED', 'RUNNING']));
    for (const { id } of stuck) {
      const jobs = await this.boss.findJobs<SyncJob>(QUEUE, { key: id });
      if (jobs.some((j) => LIVE_STATES.has(j.state))) continue;
      this.logger.warn(
        `Account ${id}: sync was interrupted with no job left; resuming it`,
      );
      await this.db
        .update(brokerAccounts)
        .set({ syncStatus: 'IDLE' })
        .where(eq(brokerAccounts.id, id));
      await this.enqueue(id, false);
    }
  }

  /**
   * Cancels the account's queued and retrying syncs and exports (an account being
   * deleted). A job already running stops on its own: its writes fail once the account
   * is gone, and a retry finds no account.
   */
  async cancel(accountId: string): Promise<void> {
    for (const queue of [QUEUE, EXPORT_QUEUE]) {
      const jobs = await this.boss.findJobs(queue, { key: accountId });
      const pending = jobs.filter(
        (j) => j.state === 'created' || j.state === 'retry',
      );
      if (pending.length)
        await this.boss.cancel(
          queue,
          pending.map((j) => j.id),
        );
    }
  }

  /** Queues an export run for the account, unless one is already queued. */
  async enqueueExport(accountId: string): Promise<void> {
    await this.boss.send(
      EXPORT_QUEUE,
      { accountId },
      { singletonKey: accountId, heartbeatSeconds: 60 },
    );
  }

  /** Returns false when a sync for this account is already queued. */
  async enqueue(accountId: string, full: boolean): Promise<boolean> {
    const jobId = await this.boss.send(
      QUEUE,
      { accountId, full } satisfies SyncJob,
      {
        singletonKey: accountId,
        // The worker reports in every 30 s; if the process dies, the job fails within a
        // minute and is retried, and the retry resumes the sync where it stopped.
        heartbeatSeconds: 60,
      },
    );
    if (!jobId) return false;
    await this.db
      .update(brokerAccounts)
      .set({ syncStatus: 'QUEUED' })
      .where(
        and(
          eq(brokerAccounts.id, accountId),
          ne(brokerAccounts.syncStatus, 'RUNNING'),
        ),
      );
    return true;
  }
}
