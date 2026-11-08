import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { AccountsService } from '../accounts/accounts.service.js';
import type { BrokerAccount } from '../db/schema.js';
import { computeCostBasis } from '../ledger/cost-basis.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { InstrumentsService } from '../trading212/instruments.service.js';
import {
  T212ApiError,
  T212RateLimitError,
  type T212AccountSummary,
  type T212Position,
} from '../trading212/t212.types.js';
import { buildPortfolioView, type PortfolioView } from './portfolio-view.js';

/** Live data is cached briefly: Trading 212 allows about one summary call every 5 seconds. */
const LIVE_TTL_MS = 20_000;
/** How long a page view may wait out Trading 212 rate limits in total. */
const MAX_RATE_LIMIT_WAIT_MS = 8_000;
const MIN_RATE_LIMIT_WAIT_MS = 500;
const MAX_RATE_LIMIT_ATTEMPTS = 4;

export interface LiveSnapshot {
  at: Date;
  summary: T212AccountSummary;
  positions: T212Position[];
}

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);
  private readonly cache = new Map<string, LiveSnapshot>();

  constructor(
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly instruments: InstrumentsService,
  ) {}

  async view(
    account: BrokerAccount,
  ): Promise<PortfolioView & { stale: boolean }> {
    const { snapshot, stale } = await this.live(account);
    const entries = await this.ledger.list(account.id);
    const engine = computeCostBasis(entries, 'AVERAGE');
    const displayTickers = await this.instruments.displayTickers(
      snapshot.positions.map((p) => p.instrument.ticker),
    );
    const view = buildPortfolioView({
      summary: snapshot.summary,
      positions: snapshot.positions,
      engine,
      entries,
      displayTickers,
      currency: account.accountCurrency,
      asOf: snapshot.at,
    });
    return { ...view, stale };
  }

  /**
   * Fresh data when possible; the last good snapshot if Trading 212 is rate limiting us.
   * `fresh` skips the cache, e.g. right after a sync when positions may have changed.
   */
  async live(
    account: BrokerAccount,
    fresh = false,
  ): Promise<{ snapshot: LiveSnapshot; stale: boolean }> {
    const cached = this.cache.get(account.id);
    if (!fresh && cached && Date.now() - cached.at.getTime() < LIVE_TTL_MS)
      return { snapshot: cached, stale: false };

    const client = this.accounts.clientFor(account);
    // Each call is retried on its own: the two endpoints have separate rate limits, so
    // repeating both after one was limited would spend the other's allowance and fail it.
    // Nothing cached to fall back on: wait out a short rate-limit window once.
    //
    // Trading 212 states the reset in whole seconds, so it can already be past when the
    // answer arrives (and a retry can still be limited for the rest of that second):
    // wait at least a short moment, and try a few times within the overall budget.
    const started = Date.now();
    const call = async <T>(fn: () => Promise<T>): Promise<T> => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await fn();
        } catch (error) {
          if (
            !(error instanceof T212RateLimitError) ||
            cached ||
            attempt >= MAX_RATE_LIMIT_ATTEMPTS
          )
            throw error;
          const waitMs = Math.max(
            MIN_RATE_LIMIT_WAIT_MS,
            error.resetAt.getTime() - Date.now() + 250,
          );
          if (Date.now() + waitMs - started > MAX_RATE_LIMIT_WAIT_MS)
            throw error;
          await sleep(waitMs);
        }
      }
    };

    try {
      const [summary, positions] = await Promise.all([
        call(() => client.accountSummary()),
        call(() => client.positions()),
      ]);
      const snapshot = { at: new Date(), summary, positions };
      this.cache.set(account.id, snapshot);
      return { snapshot, stale: false };
    } catch (error) {
      if (cached && error instanceof T212RateLimitError)
        return { snapshot: cached, stale: true };
      // The cause, for the logs (status and Trading 212's message; never credentials).
      this.logger.warn(
        `Live data for account ${account.id} failed: ${
          error instanceof T212RateLimitError
            ? `rate limited until ${error.resetAt.toISOString()}`
            : error instanceof Error
              ? error.message.slice(0, 200)
              : String(error)
        }`,
      );
      if (
        error instanceof T212ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw new BadGatewayException(
          'Το Trading 212 απέρριψε το API key. Μήπως ανακλήθηκε;',
        );
      }
      throw new BadGatewayException(
        'Δεν ήταν δυνατή η λήψη live δεδομένων από το Trading 212.',
      );
    }
  }
}
