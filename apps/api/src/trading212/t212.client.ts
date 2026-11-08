import {
  T212ApiError,
  T212RateLimitError,
  type T212AccountSummary,
  type T212InstrumentMetadata,
  type T212CashTransaction,
  type T212Dividend,
  type T212ExportReport,
  type T212Environment,
  type T212OrderItem,
  type T212Position,
  type T212Page,
} from './t212.types.js';

const BASE_URLS: Record<T212Environment, string> = {
  DEMO: 'https://demo.trading212.com',
  LIVE: 'https://live.trading212.com',
};

export const HISTORY_PATHS = {
  ORDER: '/api/v0/equity/history/orders',
  DIVIDEND: '/api/v0/equity/history/dividends',
  TRANSACTION: '/api/v0/equity/history/transactions',
} as const;

export const PAGE_SIZE = 50;

/** A whole year of a busy account is a few hundred kB; anything far beyond is not an export. */
const MAX_EXPORT_BYTES = 20 * 1024 * 1024;

export interface T212Credentials {
  apiKey: string;
  apiSecret: string;
  environment: T212Environment;
}

/**
 * Minimal, read-only Trading 212 client. It never places or changes orders: besides
 * GET endpoints it only asks for history exports (a CSV of the same data), so a key
 * with read permissions is sufficient.
 */
export class T212Client {
  private readonly authHeader: string;
  private readonly baseUrl: string;

  constructor(
    credentials: T212Credentials,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    const token = Buffer.from(
      `${credentials.apiKey.trim()}:${credentials.apiSecret.trim()}`,
    ).toString('base64');
    this.authHeader = `Basic ${token}`;
    this.baseUrl = BASE_URLS[credentials.environment];
  }

  accountSummary(): Promise<T212AccountSummary> {
    return this.get('/api/v0/equity/account/summary');
  }

  /** Open positions with live prices. */
  positions(): Promise<T212Position[]> {
    return this.get('/api/v0/equity/positions');
  }

  /** Every tradable instrument (~17k). Limited to one call per 50 seconds. */
  instruments(): Promise<T212InstrumentMetadata[]> {
    return this.get('/api/v0/equity/metadata/instruments');
  }

  /**
   * Asks Trading 212 to build a CSV of the account's history between two instants
   * (orders, dividends, interest, cash). Not available on practice accounts.
   * Limited to one call per 30 seconds.
   */
  async requestExport(from: Date, to: Date): Promise<number> {
    const { reportId } = await this.send<{ reportId: number }>(
      'POST',
      '/api/v0/equity/history/exports',
      {
        dataIncluded: {
          includeDividends: true,
          includeInterest: true,
          includeOrders: true,
          includeTransactions: true,
        },
        timeFrom: from.toISOString(),
        timeTo: to.toISOString(),
      },
    );
    return reportId;
  }

  /** Every export requested on the account and its status. One call per minute. */
  exports(): Promise<T212ExportReport[]> {
    return this.get('/api/v0/equity/history/exports');
  }

  /**
   * Downloads a finished export. The link is pre-signed and on another host, so it is
   * fetched without the API credentials.
   */
  async downloadExport(link: string): Promise<string> {
    const url = new URL(link);
    if (url.protocol !== 'https:') throw new Error('Export link is not https');
    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new T212ApiError(
        res.status,
        `Export download failed: ${res.status}`,
      );
    }
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_EXPORT_BYTES) throw new Error('Export file too large');
    const text = await res.text();
    if (text.length > MAX_EXPORT_BYTES)
      throw new Error('Export file too large');
    return text;
  }

  /**
   * Fetches one history page. `pathOrNext` is either a base history path or the
   * `nextPagePath` returned by the previous page (which already carries cursor/time).
   */
  page<T extends T212OrderItem | T212Dividend | T212CashTransaction>(
    pathOrNext: string,
  ): Promise<T212Page<T>> {
    const url = new URL(pathOrNext, this.baseUrl);
    if (!url.searchParams.has('limit'))
      url.searchParams.set('limit', String(PAGE_SIZE));
    return this.get(url.pathname + url.search);
  }

  private get<T>(path: string): Promise<T> {
    return this.send<T>('GET', path);
  }

  private async send<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(new URL(path, this.baseUrl), {
      method,
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 429) {
      throw new T212RateLimitError(
        parseReset(res.headers.get('x-ratelimit-reset')),
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new T212ApiError(
        res.status,
        `Trading 212 ${res.status} on ${path.split('?')[0]}: ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  }
}

/** x-ratelimit-reset is a unix timestamp (seconds, sometimes ms). Falls back to +60s. */
export function parseReset(value: string | null, now = Date.now()): Date {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return new Date(now + 60_000);
  return new Date(n > 10_000_000_000 ? n : n * 1000);
}
