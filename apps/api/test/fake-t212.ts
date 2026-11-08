import type { T212Client } from '../src/trading212/t212.client.js';
import {
  T212ApiError,
  T212RateLimitError,
  type T212AccountSummary,
  type T212ExportReport,
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
  /** When that rate limit says it resets, from now. Trading 212 states whole seconds, so it can already be past. */
  rateLimitResetMs = 50;
  /** Like Trading 212's per-endpoint limits: summary and positions each answer once per this window. */
  liveWindowMs: number | null = null;
  private readonly lastLive = new Map<string, number>();
  /** Export requests made, with their range. */
  exportRequests: { from: string; to: string }[] = [];
  /** Rows the export has besides what the history holds (e.g. a "Dividend adjustment"). */
  exportExtraRows: Record<string, string>[] = [];
  /** Answers export requests with this status (e.g. 403 for a key without the permission). */
  exportStatus: number | null = null;

  client(): T212Client {
    return {
      requestExport: async (from: Date, to: Date) => {
        this.track('/exports:request');
        if (this.exportStatus)
          throw new T212ApiError(
            this.exportStatus,
            `Trading 212 ${this.exportStatus}`,
          );
        this.exportRequests.push({
          from: from.toISOString(),
          to: to.toISOString(),
        });
        return this.exportRequests.length;
      },
      exports: async (): Promise<T212ExportReport[]> => {
        this.track('/exports:list');
        return this.exportRequests.map((r, i) => ({
          reportId: i + 1,
          status: 'Finished',
          downloadLink: `https://fake.invalid/report/${i + 1}`,
          timeFrom: r.from,
          timeTo: r.to,
        }));
      },
      downloadExport: async (link: string) => {
        const r = this.exportRequests[Number(link.split('/').pop()) - 1];
        return this.exportCsv(new Date(r.from), new Date(r.to));
      },
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

  /** Trading 212's CSV export of the fake history between two instants. */
  exportCsv(from: Date, to: Date): string {
    const header = [
      'Action',
      'Time (UTC)',
      'ISIN',
      'Ticker',
      'Name',
      'Notes',
      'ID',
      'No. of shares',
      'Price / share',
      'Currency (Price / share)',
      'Exchange rate',
      'Result',
      'Currency (Result)',
      'Total',
      'Currency (Total)',
      'Withholding tax',
      'Currency (Withholding tax)',
      'Deposit fee',
      'Currency (Deposit fee)',
      'Currency conversion fee',
      'Currency (Currency conversion fee)',
    ];
    const time = (iso: string) =>
      new Date(iso).toISOString().slice(0, 19).replace('T', ' ');
    const inRange = (iso: string) =>
      new Date(iso) >= from && new Date(iso) <= to;
    const rows: Record<string, string>[] = [];
    for (const o of this.orders as ReturnType<typeof buyOrSell>[]) {
      if (!o.fill || !inRange(o.fill.filledAt)) continue;
      const w = o.fill.walletImpact as {
        netValue: number;
        fxRate: number;
        realisedProfitLoss?: number;
        taxes: { quantity: number }[];
      };
      rows.push({
        Action: `Market ${o.order.side.toLowerCase()}`,
        'Time (UTC)': time(o.fill.filledAt),
        ISIN: o.order.instrument.isin,
        Ticker: 'ASTS',
        ID: `EOF${o.order.id}`,
        'No. of shares': Math.abs(o.fill.quantity).toFixed(10),
        'Price / share': o.fill.price.toFixed(10),
        'Exchange rate': w.fxRate.toFixed(8),
        Result:
          w.realisedProfitLoss === undefined
            ? ''
            : w.realisedProfitLoss.toFixed(2),
        Total: Math.abs(w.netValue).toFixed(2),
        'Currency (Total)': 'EUR',
        'Currency conversion fee': w.taxes.length
          ? Math.abs(w.taxes[0].quantity).toFixed(2)
          : '',
      });
    }
    const txs = this.transactions as ReturnType<typeof cash>[];
    const extraIds = new Set(this.exportExtraRows.map((r) => r.ID));
    for (const c of txs) {
      if (!inRange(c.dateTime) || c.type === 'FEE' || extraIds.has(c.reference))
        continue;
      // A card deposit: the export shows what was credited and the fee apart.
      const fee =
        c.type === 'DEPOSIT'
          ? txs.find((f) => f.type === 'FEE' && f.dateTime === c.dateTime)
          : undefined;
      const action =
        {
          DEPOSIT: 'Deposit',
          WITHDRAW: 'Withdrawal',
          INTEREST_ON_FREE_CASH: 'Interest on cash',
        }[c.type] ?? c.type;
      rows.push({
        Action: action,
        'Time (UTC)': time(c.dateTime),
        ID: c.reference,
        Total: (c.amount + (fee?.amount ?? 0)).toFixed(2),
        'Currency (Total)': 'EUR',
        'Deposit fee': fee ? fee.amount.toFixed(2) : '',
      });
    }
    for (const d of this.dividends as ReturnType<typeof dividend>[]) {
      if (!inRange(d.paidOn)) continue;
      rows.push({
        Action: 'Dividend (Dividend)',
        'Time (UTC)': time(d.paidOn),
        ISIN: d.instrument.isin,
        Ticker: 'KO',
        'No. of shares': d.quantity.toFixed(10),
        'Price / share': (d.amount / d.quantity).toFixed(6),
        'Currency (Price / share)': 'EUR',
        'Exchange rate': '1.00000000',
        Total: d.amount.toFixed(2),
        'Currency (Total)': 'EUR',
        'Withholding tax': d.withheld.toFixed(2),
        'Currency (Withholding tax)': 'EUR',
      });
    }
    rows.push(
      ...this.exportExtraRows.filter((r) =>
        inRange(r['Time (UTC)'].replace(' ', 'T') + 'Z'),
      ),
    );
    const quote = (v = '') =>
      /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
    return [
      header.join(','),
      ...rows.map((r) => header.map((h) => quote(r[h])).join(',')),
    ].join('\n');
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
      throw new T212RateLimitError(
        new Date(Date.now() + this.rateLimitResetMs),
      );
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

/** A dividend paid in EUR (Coca-Cola on a European line), with the tax Trading 212 withheld. */
export function dividend(opts: {
  at: string;
  quantity: number;
  amount: number;
  withheld: number;
}) {
  return {
    type: 'DIVIDEND',
    amount: opts.amount,
    amountInEuro: opts.amount,
    currency: 'EUR',
    quantity: opts.quantity,
    paidOn: opts.at,
    ticker: 'KO_US_EQ',
    reference: `div-${++ref}`,
    grossAmountPerShare: (opts.amount + opts.withheld) / opts.quantity,
    instrument: {
      ticker: 'KO_US_EQ',
      name: 'Coca-Cola',
      isin: 'US1912161007',
      currency: 'EUR',
    },
    withheld: opts.withheld,
  };
}
