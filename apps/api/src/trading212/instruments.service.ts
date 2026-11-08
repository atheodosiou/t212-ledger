import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/db.js';
import { appState, instruments } from '../db/schema.js';
import type { T212Client } from './t212.client.js';

const CHECKED_KEY = 'instruments_checked_at';
/** Names rarely change; a routine check once a week is plenty. */
const ROUTINE_MS = 7 * 24 * 60 * 60 * 1000;
/** An unknown ticker justifies an early check, but not more than once an hour (the endpoint allows 1 call / 50 s). */
const MISSING_MS = 60 * 60 * 1000;
const UPSERT_CHUNK = 1000;

export type RefreshReason = 'never-checked' | 'weekly' | 'unknown-tickers';

/** Pure decision, kept separate so it can be tested without a database. */
export function refreshReason(
  lastChecked: Date | null,
  missingTickers: number,
  now: Date,
): RefreshReason | null {
  if (!lastChecked) return 'never-checked';
  const age = now.getTime() - lastChecked.getTime();
  if (age >= ROUTINE_MS) return 'weekly';
  if (missingTickers > 0 && age >= MISSING_MS) return 'unknown-tickers';
  return null;
}

@Injectable()
export class InstrumentsService {
  private readonly logger = new Logger(InstrumentsService.name);

  constructor(@InjectDrizzle() private readonly db: Db) {}

  /**
   * Reloads instrument metadata only when needed for the given tickers, and writes
   * only rows whose values changed. Returns how many rows were inserted or changed
   * (0 when nothing was fetched).
   */
  async refreshIfNeeded(
    client: T212Client,
    tickers: string[],
    now = new Date(),
  ): Promise<number> {
    const unique = [...new Set(tickers.filter(Boolean))];
    const known = unique.length
      ? await this.db
          .select({ ticker: instruments.ticker })
          .from(instruments)
          .where(inArray(instruments.ticker, unique))
      : [];
    const missing = unique.length - known.length;

    const [checked] = await this.db
      .select()
      .from(appState)
      .where(eq(appState.key, CHECKED_KEY));
    const reason = refreshReason(
      checked ? new Date(checked.value as string) : null,
      missing,
      now,
    );
    if (!reason) return 0;

    const list = await client.instruments();
    const rows = list
      .filter((i) => i.ticker && i.shortName)
      .map((i) => ({
        ticker: i.ticker,
        shortName: i.shortName,
        name: i.name ?? null,
        isin: i.isin ?? null,
        currency: i.currencyCode ?? null,
        type: i.type ?? null,
        updatedAt: now,
      }));

    let changed = 0;
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const written = await this.db
        .insert(instruments)
        .values(rows.slice(i, i + UPSERT_CHUNK))
        .onConflictDoUpdate({
          target: instruments.ticker,
          set: {
            shortName: sql`excluded.short_name`,
            name: sql`excluded.name`,
            isin: sql`excluded.isin`,
            currency: sql`excluded.currency`,
            type: sql`excluded.type`,
            updatedAt: sql`excluded.updated_at`,
          },
          // Skip the write entirely when nothing about the instrument changed.
          setWhere: sql`(${instruments.shortName}, ${instruments.name}, ${instruments.isin}, ${instruments.currency}, ${instruments.type})
            is distinct from (excluded.short_name, excluded.name, excluded.isin, excluded.currency, excluded.type)`,
        })
        .returning({ ticker: instruments.ticker });
      changed += written.length;
    }

    await this.db
      .insert(appState)
      .values({ key: CHECKED_KEY, value: now.toISOString(), updatedAt: now })
      .onConflictDoUpdate({
        target: appState.key,
        set: { value: now.toISOString(), updatedAt: now },
      });

    this.logger.log(
      `Instrument metadata checked (${reason}): ${rows.length} instruments, ${changed} new or changed`,
    );
    return changed;
  }

  /** Internal ticker -> market ticker, for the given tickers. */
  async displayTickers(tickers: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(tickers.filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = await this.db
      .select({ ticker: instruments.ticker, shortName: instruments.shortName })
      .from(instruments)
      .where(inArray(instruments.ticker, unique));
    return new Map(rows.map((r) => [r.ticker, r.shortName]));
  }
}

/** Fallback when metadata is unavailable: KO_US_EQ -> KO. */
export function fallbackDisplayTicker(ticker: string): string {
  return ticker.split('_')[0];
}
