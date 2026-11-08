import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Decimal } from 'decimal.js';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Db } from '../db/db.js';
import {
  fallbackDisplayTicker,
  InstrumentsService,
} from '../trading212/instruments.service.js';
import {
  instruments,
  ledgerEntries,
  rawEvents,
  type LedgerEntry,
  type NewLedgerEntry,
  type RawEvent,
} from '../db/schema.js';
import {
  computeCostBasis,
  DEFAULT_TAX_TIME_ZONE,
  taxYearOf,
  type CostMethod,
  type EngineResult,
  type RealisedSale,
} from './cost-basis.js';
import { estimateDividends, type DividendDetail } from './dividends.js';
import { normalizeRaw, type LedgerKind } from './normalize.js';
import {
  matches,
  pageInMemory,
  toPage,
  type Page,
  type PageRequest,
} from './paging.js';
import { buildTimeline, type Timeline } from './timeline.js';

const INSERT_CHUNK = 500;

export const LEDGER_SORT_COLUMNS = {
  date: ledgerEntries.occurredAt,
  kind: ledgerEntries.kind,
  ticker: ledgerEntries.displayTicker,
  quantity: ledgerEntries.quantity,
  price: ledgerEntries.price,
  fees: ledgerEntries.fees,
  cash: ledgerEntries.cashAmount,
} as const;
export type LedgerSort = keyof typeof LEDGER_SORT_COLUMNS;

export const SALE_SORTS = [
  'date',
  'ticker',
  'quantity',
  'proceeds',
  'costBasis',
  'realisedPnl',
  'brokerRealisedPnl',
] as const;
export type SaleSort = (typeof SALE_SORTS)[number];

export interface SalesTotals {
  proceeds: string;
  costBasis: string;
  realisedPnl: string;
  brokerRealisedPnl: string;
  fees: string;
}

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

  /**
   * Re-derives the whole ledger of an account from its raw events. Only needed when
   * the normalization rules change (see LEDGER_VERSION). Returns the entry count.
   */
  async rebuild(accountId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const raws = await tx
        .select()
        .from(rawEvents)
        .where(eq(rawEvents.accountId, accountId));
      const rows = await this.toLedgerRows(accountId, raws);
      await tx
        .delete(ledgerEntries)
        .where(eq(ledgerEntries.accountId, accountId));
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        await tx.insert(ledgerEntries).values(rows.slice(i, i + INSERT_CHUNK));
      }
      return rows.length;
    });
  }

  /** Adds ledger entries for newly stored raw events only. Returns how many were added. */
  async append(accountId: string, rawEventIds: string[]): Promise<number> {
    if (!rawEventIds.length) return 0;
    let added = 0;
    for (let i = 0; i < rawEventIds.length; i += INSERT_CHUNK) {
      const raws = await this.db
        .select()
        .from(rawEvents)
        .where(
          and(
            eq(rawEvents.accountId, accountId),
            inArray(rawEvents.id, rawEventIds.slice(i, i + INSERT_CHUNK)),
          ),
        );
      const rows = await this.toLedgerRows(accountId, raws);
      if (rows.length) {
        // A raw event maps to at most one entry; the unique index makes a repeat a no-op.
        const inserted = await this.db
          .insert(ledgerEntries)
          .values(rows)
          .onConflictDoNothing({ target: ledgerEntries.rawEventId })
          .returning({ id: ledgerEntries.id });
        added += inserted.length;
      }
    }
    return added;
  }

  /** Points entries at current market tickers, touching only rows whose name changed. */
  async refreshDisplayTickers(accountId: string): Promise<number> {
    const result = await this.db.execute(sql`
      update ${ledgerEntries} le
         set display_ticker = i.short_name
        from ${instruments} i
       where le.account_id = ${accountId}
         and le.ticker = i.ticker
         and le.display_ticker is distinct from i.short_name`);
    return result.rowCount ?? 0;
  }

  private async toLedgerRows(
    accountId: string,
    raws: RawEvent[],
  ): Promise<NewLedgerEntry[]> {
    const rows: NewLedgerEntry[] = [];
    for (const raw of raws) {
      const normalized = normalizeRaw(raw.source, raw.payload);
      if (normalized)
        rows.push({ ...normalized, accountId, rawEventId: raw.id });
    }
    const names = await this.instruments.displayTickers(
      rows.map((r) => r.ticker ?? ''),
    );
    for (const row of rows) {
      if (row.ticker)
        row.displayTicker =
          names.get(row.ticker) ?? fallbackDisplayTicker(row.ticker);
    }
    return rows;
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

  /** One page of ledger entries, filtered and sorted in the database. */
  async page(
    accountId: string,
    filter: { year?: number; kind?: LedgerKind; q?: string },
    req: PageRequest<LedgerSort>,
  ): Promise<Page<LedgerEntry>> {
    const conditions: SQL[] = [eq(ledgerEntries.accountId, accountId)];
    if (filter.year) {
      conditions.push(
        sql`extract(year from ${ledgerEntries.occurredAt} at time zone ${DEFAULT_TAX_TIME_ZONE}) = ${filter.year}`,
      );
    }
    if (filter.kind) conditions.push(eq(ledgerEntries.kind, filter.kind));
    if (filter.q?.trim()) {
      const like = `%${filter.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conditions.push(
        or(
          ilike(ledgerEntries.displayTicker, like),
          ilike(ledgerEntries.ticker, like),
          ilike(ledgerEntries.isin, like),
          ilike(ledgerEntries.instrumentName, like),
        )!,
      );
    }
    const where = and(...conditions);
    const column = LEDGER_SORT_COLUMNS[req.sort];
    const order = req.dir === 'asc' ? asc(column) : desc(column);
    // Nulls last either way; id as a stable tie-breaker so pages never overlap.
    const nullsLast = sql`${column} is null`;

    const [items, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(ledgerEntries)
        .where(where)
        .orderBy(
          nullsLast,
          order,
          asc(ledgerEntries.occurredAt),
          asc(ledgerEntries.id),
        )
        .limit(req.limit)
        .offset(req.offset),
      this.db.select({ total: count() }).from(ledgerEntries).where(where),
    ]);
    return toPage(items, total, req);
  }

  /** One page of realised sales, with totals for everything that matches the filter. */
  async salesPage(
    accountId: string,
    method: CostMethod,
    filter: { year?: number; q?: string },
    req: PageRequest<SaleSort>,
  ): Promise<Page<RealisedSale> & { totals: SalesTotals }> {
    const yearOf = taxYearOf(DEFAULT_TAX_TIME_ZONE);
    const { sales } = computeCostBasis(await this.list(accountId), method);
    const filtered = sales.filter(
      (s) =>
        (!filter.year || yearOf(s.date) === filter.year) &&
        matches(filter.q, s.ticker, s.isin, s.instrumentName),
    );
    const sum = (pick: (s: RealisedSale) => string | null) =>
      filtered
        .reduce((acc, s) => acc.plus(pick(s) ?? 0), new Decimal(0))
        .toFixed(2);
    const page = pageInMemory(filtered, req, (s, sort) =>
      sort === 'date' ? s.date : s[sort],
    );
    return {
      ...page,
      totals: {
        proceeds: sum((s) => s.proceeds),
        costBasis: sum((s) => s.costBasis),
        realisedPnl: sum((s) => s.realisedPnl),
        brokerRealisedPnl: sum((s) => s.brokerRealisedPnl),
        fees: sum((s) => s.sellFees),
      },
    };
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
    return {
      ...computeCostBasis(entries, method),
      dividends: estimateDividends(entries, accountCurrency),
    };
  }
}
