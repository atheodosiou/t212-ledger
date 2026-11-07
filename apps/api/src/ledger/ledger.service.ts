import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/db.js';
import { fallbackDisplayTicker, InstrumentsService } from '../trading212/instruments.service.js';
import { ledgerEntries, rawEvents, type LedgerEntry, type NewLedgerEntry } from '../db/schema.js';
import { computeCostBasis, DEFAULT_TAX_TIME_ZONE, type CostMethod, type EngineResult } from './cost-basis.js';
import { estimateDividends, type DividendDetail } from './dividends.js';
import { normalizeRaw, type LedgerKind } from './normalize.js';
import { buildTimeline, type Timeline } from './timeline.js';

const INSERT_CHUNK = 500;

export interface LedgerFilter {
  year?: number;
  ticker?: string;
  kind?: LedgerKind;
}

@Injectable()
export class LedgerService {
  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly instruments: InstrumentsService,
  ) {}

  /** Re-derives the whole ledger of an account from its raw events. Returns the entry count. */
  async rebuild(accountId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const raws = await tx.select().from(rawEvents).where(eq(rawEvents.accountId, accountId));
      const rows: NewLedgerEntry[] = [];
      for (const raw of raws) {
        const normalized = normalizeRaw(raw.source, raw.payload);
        if (normalized) rows.push({ ...normalized, accountId, rawEventId: raw.id });
      }

      const names = await this.instruments.displayTickers(rows.map((r) => r.ticker ?? ''));
      for (const row of rows) {
        if (row.ticker) row.displayTicker = names.get(row.ticker) ?? fallbackDisplayTicker(row.ticker);
      }

      await tx.delete(ledgerEntries).where(eq(ledgerEntries.accountId, accountId));
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        await tx.insert(ledgerEntries).values(rows.slice(i, i + INSERT_CHUNK));
      }
      return rows.length;
    });
  }

  list(accountId: string, filter: LedgerFilter = {}): Promise<LedgerEntry[]> {
    const conditions: SQL[] = [eq(ledgerEntries.accountId, accountId)];
    if (filter.year) {
      conditions.push(
        sql`extract(year from ${ledgerEntries.occurredAt} at time zone ${DEFAULT_TAX_TIME_ZONE}) = ${filter.year}`,
      );
    }
    if (filter.ticker) conditions.push(eq(ledgerEntries.ticker, filter.ticker));
    if (filter.kind) conditions.push(eq(ledgerEntries.kind, filter.kind));

    return this.db
      .select()
      .from(ledgerEntries)
      .where(and(...conditions))
      .orderBy(asc(ledgerEntries.occurredAt));
  }

  async timeline(accountId: string, method: CostMethod): Promise<Timeline> {
    return buildTimeline(await this.list(accountId), method);
  }

  /** Replays the full ledger (cost basis needs the whole history, whatever year is reported). */
  async report(
    accountId: string,
    method: CostMethod,
    accountCurrency = 'EUR',
  ): Promise<EngineResult & { dividends: DividendDetail[] }> {
    const entries = await this.list(accountId);
    return { ...computeCostBasis(entries, method), dividends: estimateDividends(entries, accountCurrency) };
  }
}
