import type { T212Client } from '../src/trading212/t212.client.js';
import {
  T212RateLimitError,
  type T212AccountSummary,
  type T212Position,
} from '../src/trading212/t212.types.js';

/**
 * Stands in for Trading 212: serves history pages newest first with cursor/limit
 * paging like the real API, live positions and cash, and instrument metadata.
 * Records every request so tests can assert what was (not) downloaded.
 */
export class FakeT212 {
  orders: unknown[] = [];
  dividends: unknown[] = [];
  transactions: unknown[] = [];
  positionsNow: T212Position[] = [];
  cash = 0;
  requests: string[] = [];
  /** Throws a network error on this request number (1-based), once. */
  failAt: number | null = null;
  /** Answers this request number with a rate limit, once. */
  rateLimitAt: number | null = null;
  /** Like Trading 212's per-endpoint limits: summary and positions each answer once per this window. */
  liveWindowMs: number | null = null;
  private readonly lastLive = new Map<string, number>();

  client(): T212Client {
    return {
      page: async (path: string) => this.page(path),
      accountSummary: async (): Promise<T212AccountSummary> => {
        this.track('/summary');
        this.limitLive('/summary');
        return {
          totalValue: this.cash,
          cash: {
            availableToTrade: this.cash,
            reservedForOrders: 0,
            inPies: 0,
          },
        };
      },
      positions: async () => {
        this.track('/positions');
        this.limitLive('/positions');
        return this.positionsNow;
      },
      instruments: async () => {
        this.track('/instruments');
        return [
          {
            ticker: 'NPA_US_EQ',
            shortName: 'ASTS',
            name: 'AST SpaceMobile',
            isin: 'US00217D1000',
            currencyCode: 'USD',
          },
          {
            ticker: 'KO_US_EQ',
            shortName: 'KO',
            name: 'Coca-Cola',
            isin: 'US1912161007',
            currencyCode: 'USD',
          },
        ];
      },
    } as unknown as T212Client;
  }

  historyRequests(): string[] {
    return this.requests.filter((r) => r.includes('/history/'));
  }

  private limitLive(endpoint: string): void {
    if (this.liveWindowMs === null) return;
    const last = this.lastLive.get(endpoint);
    if (last !== undefined && Date.now() - last < this.liveWindowMs) {
      throw new T212RateLimitError(new Date(last + this.liveWindowMs));
    }
    this.lastLive.set(endpoint, Date.now());
  }

  private track(path: string): void {
    this.requests.push(path);
    const n = this.requests.length;
    if (this.failAt === n) {
      this.failAt = null;
      throw new Error('network down');
    }
    if (this.rateLimitAt === n) {
      this.rateLimitAt = null;
      throw new T212RateLimitError(new Date(Date.now() + 50));
    }
  }

  private async page(path: string) {
    this.track(path);
    const url = new URL(path, 'https://fake.invalid');
    const list = url.pathname.endsWith('/orders')
      ? this.orders
      : url.pathname.endsWith('/dividends')
        ? this.dividends
        : this.transactions;
    const start = Number(url.searchParams.get('cursor') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const items = list.slice(start, start + limit);
    const nextPagePath =
      start + limit < list.length
        ? `${url.pathname}?cursor=${start + limit}&limit=${limit}`
        : null;
    return { items, nextPagePath };
  }
}

// ── Record builders, shaped like real Trading 212 payloads ────────────────────

let fillId = 1000;

export function buyOrSell(
  side: 'BUY' | 'SELL',
  opts: {
    ticker?: string;
    isin?: string;
    quantity: number;
    price: number;
    netValue: number;
    fee?: number;
    at: string;
  },
) {
  const id = ++fillId;
  return {
    order: {
      id,
      side,
      type: 'MARKET',
      status: 'FILLED',
      ticker: opts.ticker ?? 'NPA_US_EQ',
      currency: 'EUR',
      strategy: 'QUANTITY',
      createdAt: opts.at,
      instrument: {
        ticker: opts.ticker ?? 'NPA_US_EQ',
        name: 'AST SpaceMobile',
        isin: opts.isin ?? 'US00217D1000',
        currency: 'USD',
      },
    },
    fill: {
      id: id * 10,
      type: 'TRADE',
      price: opts.price,
      filledAt: opts.at,
      quantity: side === 'BUY' ? opts.quantity : -opts.quantity,
      walletImpact: {
        currency: 'EUR',
        fxRate: 1.1,
        netValue: opts.netValue,
        taxes: opts.fee
          ? [
              {
                name: 'CURRENCY_CONVERSION_FEE',
                currency: 'EUR',
                quantity: -opts.fee,
              },
            ]
          : [],
        ...(side === 'SELL' ? { realisedProfitLoss: 1 } : {}),
      },
    },
  };
}

let ref = 0;
export function cash(type: string, amount: number, at: string) {
  return {
    type,
    amount,
    currency: 'EUR',
    dateTime: at,
    reference: `ref-${++ref}`,
  };
}

/** Newest first, like Trading 212. */
export function newestFirst(items: unknown[]): unknown[] {
  const time = (i: unknown) => {
    const r = i as { order?: { createdAt?: string }; dateTime?: string };
    return Date.parse(r.order?.createdAt ?? r.dateTime ?? '');
  };
  return [...items].sort((a, b) => time(b) - time(a));
}
