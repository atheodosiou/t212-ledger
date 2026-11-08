import { matches, pageInMemory, toPage } from './paging.js';

const rows = [
  { id: 'a', ticker: 'NVDA', pnl: '-10.5', date: new Date('2025-01-02') },
  { id: 'b', ticker: 'AAPL', pnl: '3', date: new Date('2025-01-01') },
  { id: 'c', ticker: 'MSFT', pnl: '100', date: new Date('2025-01-03') },
  { id: 'd', ticker: 'ASTS', pnl: null, date: new Date('2025-01-04') },
];
const value = (r: (typeof rows)[number], sort: 'ticker' | 'pnl' | 'date') =>
  r[sort];

describe('pageInMemory', () => {
  it('sorts decimal strings as numbers, not text', () => {
    const page = pageInMemory(
      rows,
      { sort: 'pnl', dir: 'asc', limit: 10, offset: 0 },
      value,
    );
    expect(page.items.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps empty values last in both directions', () => {
    const desc = pageInMemory(
      rows,
      { sort: 'pnl', dir: 'desc', limit: 10, offset: 0 },
      value,
    );
    expect(desc.items.map((r) => r.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('sorts descending', () => {
    const page = pageInMemory(
      rows,
      { sort: 'date', dir: 'desc', limit: 10, offset: 0 },
      value,
    );
    expect(page.items.map((r) => r.id)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('pages with a next offset until the end', () => {
    const first = pageInMemory(
      rows,
      { sort: 'ticker', dir: 'asc', limit: 3, offset: 0 },
      value,
    );
    expect(first).toMatchObject({ total: 4, nextOffset: 3 });
    expect(first.items.map((r) => r.ticker)).toEqual(['AAPL', 'ASTS', 'MSFT']);
    const last = pageInMemory(
      rows,
      { sort: 'ticker', dir: 'asc', limit: 3, offset: 3 },
      value,
    );
    expect(last).toMatchObject({ nextOffset: null, items: [rows[0]] });
  });
});

describe('helpers', () => {
  it('reports no next page when everything fits', () => {
    expect(toPage([1, 2], 2, { limit: 50, offset: 0 }).nextOffset).toBeNull();
  });

  it('matches any field, case-insensitively', () => {
    expect(matches('nvd', 'NVDA', 'Nvidia')).toBe(true);
    expect(matches('xyz', 'NVDA', null)).toBe(false);
    expect(matches(undefined, 'anything')).toBe(true);
  });
});
