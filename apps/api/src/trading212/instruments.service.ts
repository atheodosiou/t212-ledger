import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/db.js';
import { instruments } from '../db/schema.js';
import type { T212Client } from './t212.client.js';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UPSERT_CHUNK = 1000;

@Injectable()
export class InstrumentsService {
  private readonly logger = new Logger(InstrumentsService.name);

  constructor(@InjectDrizzle() private readonly db: Db) {}

  /** Reloads the metadata when it is missing or older than a day. Returns whether it reloaded. */
  async refreshIfStale(client: T212Client, now = new Date()): Promise<boolean> {
    const [{ lastUpdate }] = await this.db
      .select({ lastUpdate: sql<string | null>`max(${instruments.updatedAt})` })
      .from(instruments);
    if (lastUpdate && now.getTime() - new Date(lastUpdate).getTime() < MAX_AGE_MS) return false;

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

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      await this.db
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
        });
    }
    this.logger.log(`Instrument metadata refreshed: ${rows.length} instruments`);
    return true;
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
