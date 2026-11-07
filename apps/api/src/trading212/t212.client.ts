import {
  T212ApiError,
  T212RateLimitError,
  type T212AccountSummary,
  type T212CashTransaction,
  type T212Dividend,
  type T212Environment,
  type T212OrderItem,
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

export interface T212Credentials {
  apiKey: string;
  apiSecret: string;
  environment: T212Environment;
}

/**
 * Minimal, read-only Trading 212 client. Uses only GET endpoints, so a key
 * created with read permissions is sufficient.
 */
export class T212Client {
  private readonly authHeader: string;
  private readonly baseUrl: string;

  constructor(
    credentials: T212Credentials,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    const token = Buffer.from(`${credentials.apiKey.trim()}:${credentials.apiSecret.trim()}`).toString('base64');
    this.authHeader = `Basic ${token}`;
    this.baseUrl = BASE_URLS[credentials.environment];
  }

  accountSummary(): Promise<T212AccountSummary> {
    return this.get('/api/v0/equity/account/summary');
  }

  /**
   * Fetches one history page. `pathOrNext` is either a base history path or the
   * `nextPagePath` returned by the previous page (which already carries cursor/time).
   */
  page<T extends T212OrderItem | T212Dividend | T212CashTransaction>(pathOrNext: string): Promise<T212Page<T>> {
    const url = new URL(pathOrNext, this.baseUrl);
    if (!url.searchParams.has('limit')) url.searchParams.set('limit', String(PAGE_SIZE));
    return this.get(url.pathname + url.search);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchFn(new URL(path, this.baseUrl), {
      headers: { Authorization: this.authHeader, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 429) {
      throw new T212RateLimitError(parseReset(res.headers.get('x-ratelimit-reset')));
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new T212ApiError(res.status, `Trading 212 ${res.status} on ${path.split('?')[0]}: ${body.slice(0, 200)}`);
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
