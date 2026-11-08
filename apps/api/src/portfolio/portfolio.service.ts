import { BadGatewayException, Injectable } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { AccountsService } from '../accounts/accounts.service.js';
import type { BrokerAccount } from '../db/schema.js';
import { computeCostBasis } from '../ledger/cost-basis.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { InstrumentsService } from '../trading212/instruments.service.js';
import { T212ApiError, T212RateLimitError, type T212AccountSummary, type T212Position } from '../trading212/t212.types.js';
import { buildPortfolioView, type PortfolioView } from './portfolio-view.js';

/** Live data is cached briefly: Trading 212 allows about one summary call every 5 seconds. */
const LIVE_TTL_MS = 20_000;
const MAX_RATE_LIMIT_WAIT_MS = 6_000;

interface LiveSnapshot {
  at: Date;
  summary: T212AccountSummary;
  positions: T212Position[];
}

@Injectable()
export class PortfolioService {
  private readonly cache = new Map<string, LiveSnapshot>();

  constructor(
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly instruments: InstrumentsService,
  ) {}

  async view(account: BrokerAccount): Promise<PortfolioView & { stale: boolean }> {
    const { snapshot, stale } = await this.live(account);
    const entries = await this.ledger.list(account.id);
    const engine = computeCostBasis(entries, 'AVERAGE');
    const displayTickers = await this.instruments.displayTickers(snapshot.positions.map((p) => p.instrument.ticker));
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

  /** Fresh data when possible; the last good snapshot if Trading 212 is rate limiting us. */
  private async live(account: BrokerAccount): Promise<{ snapshot: LiveSnapshot; stale: boolean }> {
    const cached = this.cache.get(account.id);
    if (cached && Date.now() - cached.at.getTime() < LIVE_TTL_MS) return { snapshot: cached, stale: false };

    const client = this.accounts.clientFor(account);
    const fetchLive = async () => {
      const [summary, positions] = await Promise.all([client.accountSummary(), client.positions()]);
      const snapshot = { at: new Date(), summary, positions };
      this.cache.set(account.id, snapshot);
      return { snapshot, stale: false };
    };

    try {
      try {
        return await fetchLive();
      } catch (error) {
        // Nothing cached to fall back on: wait out a short rate-limit window once.
        const waitMs = error instanceof T212RateLimitError ? error.resetAt.getTime() - Date.now() + 250 : -1;
        if (cached || waitMs < 0 || waitMs > MAX_RATE_LIMIT_WAIT_MS) throw error;
        await sleep(waitMs);
        return await fetchLive();
      }
    } catch (error) {
      if (cached && error instanceof T212RateLimitError) return { snapshot: cached, stale: true };
      if (error instanceof T212ApiError && (error.status === 401 || error.status === 403)) {
        throw new BadGatewayException('Το Trading 212 απέρριψε το API key. Μήπως ανακλήθηκε;');
      }
      throw new BadGatewayException('Δεν ήταν δυνατή η λήψη live δεδομένων από το Trading 212.');
    }
  }
}
