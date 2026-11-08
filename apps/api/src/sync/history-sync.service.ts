import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import { setTimeout as sleep } from 'node:timers/promises';
import { AccountsService } from '../accounts/accounts.service.js';
import type { Db } from '../db/db.js';
import {
  brokerAccounts,
  rawEvents,
  type SyncProgress,
  type SyncStage,
  type SyncStreamsState,
} from '../db/schema.js';
import { LedgerService } from '../ledger/ledger.service.js';
import {
  dividendIdentity,
  LEDGER_VERSION,
  orderIdentity,
  transactionIdentity,
  type RawIdentity,
  type RawSource,
} from '../ledger/normalize.js';
import { InstrumentsService } from '../trading212/instruments.service.js';
import { HISTORY_PATHS } from '../trading212/t212.client.js';
import { T212RateLimitError } from '../trading212/t212.types.js';
import { needsCheck } from '../reconciliation/reconcile.js';
import { ReconciliationService } from '../reconciliation/reconciliation.service.js';
import { walkStream } from './stream-walker.js';

const STAGE_OF: Record<RawSource, SyncStage> = {
  ORDER: 'ORDERS',
  DIVIDEND: 'DIVIDENDS',
  TRANSACTION: 'TRANSACTIONS',
};

const PROGRESS_KEY: Record<RawSource, 'orders' | 'dividends' | 'transactions'> =
  {
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
    private readonly instruments: InstrumentsService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /**
   * Brings the account's history up to date and extends its ledger.
   *
   * Stored records never change, so a routine sync downloads only a small newest
   * page per stream and writes only what is new (see walkStream). The first sync
   * walks the whole history and can resume where it stopped. `full` forgets the
   * walk positions and walks everything again; it is never needed in normal use.
   */
  async run(
    accountId: string,
    full: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    const [account] = await this.db
      .select()
      .from(brokerAccounts)
      .where(eq(brokerAccounts.id, accountId));
    if (!account) return;

    const client = this.accounts.clientFor(account);
    const progress: SyncProgress = {
      orders: 0,
      dividends: 0,
      transactions: 0,
      stage: 'ORDERS',
      waitingUntil: null,
    };
    await this.setState(accountId, {
      syncStatus: 'RUNNING',
      syncError: null,
      syncProgress: progress,
    });
    const enter = (stage: SyncStage) => {
      progress.stage = stage;
      return this.setState(accountId, { syncProgress: { ...progress } });
    };

    const streams: SyncStreamsState = full ? {} : { ...account.syncState };
    const newRawIds: string[] = [];
    const newTickers: string[] = [];
    let requests = 0;

    try {
      for (const source of ['ORDER', 'DIVIDEND', 'TRANSACTION'] as const) {
        await enter(STAGE_OF[source]);
        const result = await walkStream({
          basePath: HISTORY_PATHS[source],
          state: streams[source] ?? { backfillDone: false, resume: null },
          fetchPage: (path) =>
            this.withRateLimit(
              accountId,
              progress,
              () => client.page(path),
              signal,
            ),
          store: async (items) => {
            const stored = await this.storeRaw(accountId, source, items);
            newRawIds.push(...stored.ids);
            newTickers.push(...stored.tickers);
            progress[PROGRESS_KEY[source]] += items.length;
            await this.setState(accountId, { syncProgress: { ...progress } });
            return stored.ids.length;
          },
          saveState: async (state) => {
            streams[source] = state;
            await this.setState(accountId, { syncState: { ...streams } });
          },
        });
        requests += result.requests;
      }

      await enter('INSTRUMENTS');
      let namesChanged = 0;
      try {
        namesChanged = await this.withRateLimit(
          accountId,
          progress,
          () => this.instruments.refreshIfNeeded(client, newTickers),
          signal,
        );
      } catch (error) {
        // Display tickers are a nicety: keep the last known names rather than fail the sync.
        this.logger.warn(
          `Instrument metadata not refreshed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      await enter('LEDGER');
      let ledgerNote: string;
      if (account.ledgerVersion !== LEDGER_VERSION) {
        const entries = await this.ledger.rebuild(accountId);
        await this.setState(accountId, { ledgerVersion: LEDGER_VERSION });
        ledgerNote = `rebuilt with rules v${LEDGER_VERSION} (${entries} entries)`;
      } else {
        const added = await this.ledger.append(accountId, newRawIds);
        const renamed = namesChanged
          ? await this.ledger.refreshDisplayTickers(accountId)
          : 0;
        ledgerNote = `${added} entries added, ${renamed} renamed`;
      }

      let checkNote = 'check skipped (nothing new)';
      if (needsCheck(account.reconciliation, newRawIds.length, new Date())) {
        await enter('CHECK');
        const check = await this.reconciliation.run(account);
        checkNote = !check
          ? 'check could not run'
          : check.ok
            ? 'matches Trading 212'
            : `${check.issues.length} issue(s)`;
      }

      this.logger.log(
        `Account ${accountId}: ${requests} requests, ${newRawIds.length} new records, ledger ${ledgerNote}, ${checkNote}`,
      );
      await this.setState(accountId, {
        syncStatus: 'IDLE',
        syncProgress: { ...progress, stage: null, waitingUntil: null },
        lastSyncedAt: new Date(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Account ${accountId}: sync failed: ${message}`);
      await this.setState(accountId, {
        syncStatus: 'FAILED',
        syncError: message,
      });
      throw error;
    }
  }

  /** Stores raw items, ignoring ones already stored. Returns the ids and tickers of the new ones. */
  private async storeRaw(
    accountId: string,
    source: RawSource,
    items: unknown[],
  ): Promise<{ ids: string[]; tickers: string[] }> {
    const rows = items.map((item) => {
      const { externalId, occurredAt } = IDENTITY[source](item as never);
      return { accountId, source, externalId, occurredAt, payload: item };
    });
    const inserted = await this.db
      .insert(rawEvents)
      .values(rows)
      .onConflictDoNothing({
        target: [rawEvents.accountId, rawEvents.source, rawEvents.externalId],
      })
      .returning({ id: rawEvents.id, payload: rawEvents.payload });
    return {
      ids: inserted.map((r) => r.id),
      tickers: inserted
        .map((r) => rawTicker(r.payload))
        .filter((t): t is string => !!t),
    };
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
        if (
          !(error instanceof T212RateLimitError) ||
          attempt >= MAX_RATE_LIMIT_WAITS
        )
          throw error;
        const waitMs = Math.max(
          1_000,
          error.resetAt.getTime() - Date.now() + 1_000,
        );
        progress.waitingUntil = new Date(Date.now() + waitMs).toISOString();
        await this.setState(accountId, { syncProgress: { ...progress } });
        await sleep(waitMs, undefined, { signal });
        progress.waitingUntil = null;
      }
    }
  }

  private async setState(
    accountId: string,
    values: Partial<typeof brokerAccounts.$inferInsert>,
  ): Promise<void> {
    await this.db
      .update(brokerAccounts)
      .set(values)
      .where(eq(brokerAccounts.id, accountId));
  }
}

function rawTicker(payload: unknown): string | null {
  const p = payload as {
    order?: { instrument?: { ticker?: string }; ticker?: string };
    ticker?: string;
  };
  return p.order?.instrument?.ticker ?? p.order?.ticker ?? p.ticker ?? null;
}
