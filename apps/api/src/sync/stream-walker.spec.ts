import type { StreamSyncState } from '../db/schema.js';
import { walkStream, withLimit, type WalkPage } from './stream-walker.js';

const BASE = '/api/v0/equity/history/orders';

/** In-memory Trading 212: items newest first, cursor = index of the next item. */
function fakeApi(history: string[], failAtRequest?: number) {
  const requests: string[] = [];
  const fetchPage = async (path: string): Promise<WalkPage> => {
    requests.push(path);
    if (failAtRequest !== undefined && requests.length === failAtRequest) throw new Error('network down');
    const url = new URL(path, 'https://x.invalid');
    const start = Number(url.searchParams.get('cursor') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const items = history.slice(start, start + limit);
    const next = start + limit < history.length ? `${BASE}?cursor=${start + limit}&limit=${limit}` : null;
    return { items, nextPagePath: next };
  };
  return { fetchPage, requests };
}

function store(db: Set<string>) {
  return async (items: unknown[]) => {
    let inserted = 0;
    for (const item of items as string[]) {
      if (!db.has(item)) {
        db.add(item);
        inserted++;
      }
    }
    return inserted;
  };
}

const history = (n: number) => Array.from({ length: n }, (_, i) => `r${n - i}`); // r120 … r1

describe('walkStream', () => {
  it('walks the whole history on the first sync and marks the backfill done', async () => {
    const db = new Set<string>();
    const api = fakeApi(history(120));
    const states: StreamSyncState[] = [];
    const result = await walkStream({
      basePath: BASE,
      state: { backfillDone: false, resume: null },
      fetchPage: api.fetchPage,
      store: store(db),
      saveState: async (s) => void states.push(s),
    });
    expect(db.size).toBe(120);
    expect(result).toMatchObject({ requests: 3, inserted: 120 });
    expect(states.at(-1)).toEqual({ backfillDone: true, resume: null });
  });

  it('downloads only a small page when nothing is new', async () => {
    const db = new Set(history(120));
    const api = fakeApi(history(120));
    const result = await walkStream({
      basePath: BASE,
      state: { backfillDone: true, resume: null },
      fetchPage: api.fetchPage,
      store: store(db),
      saveState: async () => {},
    });
    expect(result).toEqual({ requests: 1, fetched: 10, inserted: 0 });
    expect(api.requests).toEqual([`${BASE}?limit=10`]);
  });

  it('stops at the first already-stored item when new records arrived', async () => {
    const db = new Set(history(120));
    const api = fakeApi(history(123)); // 3 new at the top
    const result = await walkStream({
      basePath: BASE,
      state: { backfillDone: true, resume: null },
      fetchPage: api.fetchPage,
      store: store(db),
      saveState: async () => {},
    });
    expect(result).toEqual({ requests: 1, fetched: 10, inserted: 3 });
  });

  it('keeps paging while whole pages are new, with full-size pages after the first', async () => {
    const db = new Set(history(100));
    const api = fakeApi(history(170)); // 70 new
    const result = await walkStream({
      basePath: BASE,
      state: { backfillDone: true, resume: null },
      fetchPage: api.fetchPage,
      store: store(db),
      saveState: async () => {},
    });
    expect(result.inserted).toBe(70);
    expect(api.requests).toEqual([`${BASE}?limit=10`, `${BASE}?cursor=10&limit=50`, `${BASE}?cursor=60&limit=50`]);
    expect(db.size).toBe(170);
  });

  it('resumes an interrupted first walk without downloading stored pages again', async () => {
    const db = new Set<string>();
    let state: StreamSyncState = { backfillDone: false, resume: null };
    const first = fakeApi(history(200), 3); // fails on the 3rd page
    await expect(
      walkStream({
        basePath: BASE,
        state,
        fetchPage: first.fetchPage,
        store: store(db),
        saveState: async (s) => void (state = s),
      }),
    ).rejects.toThrow('network down');
    expect(db.size).toBe(100);
    expect(state).toEqual({ backfillDone: false, resume: `${BASE}?cursor=100&limit=50` });

    const second = fakeApi(history(200));
    const result = await walkStream({
      basePath: BASE,
      state,
      fetchPage: second.fetchPage,
      store: store(db),
      saveState: async (s) => void (state = s),
    });
    expect(db.size).toBe(200);
    expect(state.backfillDone).toBe(true);
    // One small head check, then only the pages that were never stored.
    expect(second.requests).toEqual([`${BASE}?limit=10`, `${BASE}?cursor=100&limit=50`, `${BASE}?cursor=150&limit=50`]);
    expect(result.inserted).toBe(100);
  });

  it('ends the walk on a repeated cursor instead of looping', async () => {
    const db = new Set<string>();
    let calls = 0;
    const result = await walkStream({
      basePath: BASE,
      state: { backfillDone: false, resume: null },
      fetchPage: async () => {
        calls++;
        return { items: [`x${calls}`], nextPagePath: `${BASE}?cursor=same&limit=50` };
      },
      store: store(db),
      saveState: async () => {},
    });
    expect(result.requests).toBe(2);
  });

  it('replaces the page size in paths that already have one', () => {
    expect(withLimit('/a?cursor=5&limit=10', 50)).toBe('/a?cursor=5&limit=50');
    expect(withLimit('/a', 10)).toBe('/a?limit=10');
  });
});
