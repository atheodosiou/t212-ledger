import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import { setTimeout as sleep } from 'node:timers/promises';
import { AccountsService } from '../accounts/accounts.service.js';
import type { Db } from '../db/db.js';
import { brokerAccounts, rawEvents, type SyncProgress } from '../db/schema.js';
import { LedgerService } from '../ledger/ledger.service.js';
import {
  dividendIdentity,
  orderIdentity,
  transactionIdentity,
  type RawIdentity,
  type RawSource,
} from '../ledger/normalize.js';
import { HISTORY_PATHS, type T212Client } from '../trading212/t212.client.js';
import { T212RateLimitError } from '../trading212/t212.types.js';

const PROGRESS_KEY: Record<RawSource, keyof Omit<SyncProgress, 'waitingUntil'>> = {
  ORDER: 'orders',
  DIVIDEND: 'dividends',
  TRANSACTION: 'transactions',
};

const IDENTITY: Record<RawSource, (item: never) => RawIdentity> = {
  ORDER: orderIdentity,
  DIVIDEND: dividendIdentity,
  TRANSACTION: transactionIdentity,
};

const MAX_RATE_LIMIT_WAITS = 30;

@Injectable()
export class HistorySyncService {
  private readonly logger = new Logger(HistorySyncService.name);

  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Pulls the account's history into raw_events and rebuilds its ledger.
   * Incremental runs stop a stream at the first page that contains nothing new
   * (pages come newest first); full runs walk every page.
   */
  async run(accountId: string, full: boolean, signal?: AbortSignal): Promise<void> {
    const [account] = await this.db.select().from(brokerAccounts).where(eq(brokerAccounts.id, accountId));
    if (!account) return;

    const client = this.accounts.clientFor(account);
    const progress: SyncProgress = { orders: 0, dividends: 0, transactions: 0, waitingUntil: null };
    await this.setState(accountId, { syncStatus: 'RUNNING', syncError: null, syncProgress: progress });

    try {
      for (const source of ['ORDER', 'DIVIDEND', 'TRANSACTION'] as const) {
        await this.syncStream(client, accountId, source, full, progress, signal);
      }
      const entries = await this.ledger.rebuild(accountId);
      this.logger.log(`Account ${accountId}: synced ${JSON.stringify(progress)}, ${entries} ledger entries`);
      await this.setState(accountId, {
        syncStatus: 'IDLE',
        syncProgress: { ...progress, waitingUntil: null },
        lastSyncedAt: new Date(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Account ${accountId}: sync failed: ${message}`);
      await this.setState(accountId, { syncStatus: 'FAILED', syncError: message });
      throw error;
    }
  }

  private async syncStream(
    client: T212Client,
    accountId: string,
    source: RawSource,
    full: boolean,
    progress: SyncProgress,
    signal?: AbortSignal,
  ): Promise<void> {
    let next: string | null = HISTORY_PATHS[source];
    const visited = new Set<string>();

    while (next && !visited.has(next)) {
      visited.add(next);
      const path: string = next;
      const page = await this.withRateLimit(accountId, progress, () => client.page(path), signal);

      let inserted = 0;
      if (page.items.length > 0) {
        const rows = page.items.map((item) => {
          const { externalId, occurredAt } = IDENTITY[source](item as never);
          return { accountId, source, externalId, occurredAt, payload: item };
        });
        const result = await this.db
          .insert(rawEvents)
          .values(rows)
          .onConflictDoNothing({ target: [rawEvents.accountId, rawEvents.source, rawEvents.externalId] })
          .returning({ id: rawEvents.id });
        inserted = result.length;
      }

      progress[PROGRESS_KEY[source]] += page.items.length;
      await this.setState(accountId, { syncProgress: { ...progress } });

      if (!full && page.items.length > 0 && inserted === 0) break;
      next = page.nextPagePath;
    }
  }

  /** Waits out Trading 212 rate-limit windows instead of failing the whole sync. */
  private async withRateLimit<T>(
    accountId: string,
    progress: SyncProgress,
    fn: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (!(error instanceof T212RateLimitError) || attempt >= MAX_RATE_LIMIT_WAITS) throw error;
        const waitMs = Math.max(1_000, error.resetAt.getTime() - Date.now() + 1_000);
        progress.waitingUntil = new Date(Date.now() + waitMs).toISOString();
        await this.setState(accountId, { syncProgress: { ...progress } });
        await sleep(waitMs, undefined, { signal });
        progress.waitingUntil = null;
      }
    }
  }

  private async setState(accountId: string, values: Partial<typeof brokerAccounts.$inferInsert>): Promise<void> {
    await this.db.update(brokerAccounts).set(values).where(eq(brokerAccounts.id, accountId));
  }
}
