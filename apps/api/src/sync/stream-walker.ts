import type { StreamSyncState } from '../db/schema.js';

export interface WalkPage {
  items: unknown[];
  nextPagePath: string | null;
}

export interface WalkOptions {
  /** First page of the stream, e.g. /api/v0/equity/history/orders. */
  basePath: string;
  state: StreamSyncState;
  fetchPage: (path: string) => Promise<WalkPage>;
  /** Stores a page and returns how many of its items were new. */
  store: (items: unknown[]) => Promise<number>;
  /** Persists the walk position after every page, so a crash loses nothing. */
  saveState: (state: StreamSyncState) => Promise<void>;
  /** Size of the first, "anything new?" page. */
  headLimit?: number;
  pageLimit?: number;
}

export interface WalkResult {
  requests: number;
  fetched: number;
  inserted: number;
}

/**
 * Brings one Trading 212 history stream up to date while downloading as little
 * already-stored data as possible. Pages come newest first (orders by fill time,
 * cash by date), and records never change once written, so:
 *
 * 1. Head: if anything is stored already, fetch a small newest page and keep
 *    going only while every item on a page is new. The first known item means
 *    everything older is known too.
 * 2. Backfill: until the whole history has been stored once, walk it from where
 *    the last walk stopped (not from the start), saving the position after
 *    every page.
 */
export async function walkStream(options: WalkOptions): Promise<WalkResult> {
  const headLimit = options.headLimit ?? 10;
  const pageLimit = options.pageLimit ?? 50;
  const result: WalkResult = { requests: 0, fetched: 0, inserted: 0 };
  let state = { ...options.state };

  const fetchAndStore = async (path: string) => {
    const page = await options.fetchPage(path);
    result.requests++;
    result.fetched += page.items.length;
    const inserted = page.items.length ? await options.store(page.items) : 0;
    result.inserted += inserted;
    return { page, inserted };
  };

  const hasHistory = state.backfillDone || state.resume !== null;
  if (hasHistory) {
    let path: string | null = withLimit(options.basePath, headLimit);
    const visited = new Set<string>();
    while (path && !visited.has(path)) {
      visited.add(path);
      const { page, inserted } = await fetchAndStore(path);
      if (inserted < page.items.length || !page.nextPagePath) break;
      path = withLimit(page.nextPagePath, pageLimit);
    }
  }

  if (!state.backfillDone) {
    let path: string = state.resume ?? withLimit(options.basePath, pageLimit);
    const visited = new Set<string>();
    for (;;) {
      visited.add(path);
      const { page } = await fetchAndStore(path);
      const next = page.nextPagePath ? withLimit(page.nextPagePath, pageLimit) : null;
      // A repeated cursor would loop forever; treat it as the end of history.
      state = next && !visited.has(next) ? { backfillDone: false, resume: next } : { backfillDone: true, resume: null };
      await options.saveState(state);
      if (state.backfillDone) break;
      path = next!;
    }
  }

  return result;
}

/** Sets (or replaces) the page size in a path that may already carry a cursor. */
export function withLimit(path: string, limit: number): string {
  const url = new URL(path, 'https://placeholder.invalid');
  url.searchParams.set('limit', String(limit));
  return url.pathname + url.search;
}
