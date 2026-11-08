import type { ExportState } from '../db/schema.js';
import { coveredPeriod, plannedExports, startOfYear } from './plan.js';

const TZ = 'Europe/Athens';
const at = (iso: string) => new Date(iso);

describe('startOfYear', () => {
  it('is midnight on 1 January in the time zone', () => {
    expect(startOfYear(2025, TZ).toISOString()).toBe(
      '2024-12-31T22:00:00.000Z',
    );
    expect(startOfYear(2025, 'UTC').toISOString()).toBe(
      '2025-01-01T00:00:00.000Z',
    );
  });
});

describe('plannedExports', () => {
  const now = at('2026-11-08T20:00:00Z');
  const first = at('2024-01-08T16:41:43Z');

  it('asks for every year from the first activity, the running one up to now', () => {
    const plan = plannedExports(first, null, now, TZ);
    expect(
      plan.map((p) => [p.year, p.from.toISOString(), p.to.toISOString()]),
    ).toEqual([
      [2024, '2023-12-31T22:00:00.000Z', '2024-12-31T21:59:59.000Z'],
      [2025, '2024-12-31T22:00:00.000Z', '2025-12-31T21:59:59.000Z'],
      [2026, '2025-12-31T22:00:00.000Z', '2026-11-08T20:00:00.000Z'],
    ]);
  });

  it('never fetches a finished year twice, and the running one at most daily', () => {
    const state: ExportState = {
      years: {
        '2024': {
          coveredTo: '2024-12-31T21:59:59.000Z',
          fetchedAt: '2026-11-01T00:00:00Z',
          rows: 1,
        },
        '2025': {
          coveredTo: '2025-12-31T21:59:59.000Z',
          fetchedAt: '2026-11-01T00:00:00Z',
          rows: 1,
        },
        '2026': {
          coveredTo: '2026-11-08T10:00:00.000Z',
          fetchedAt: '2026-11-08T10:00:00Z',
          rows: 1,
        },
      },
    };
    expect(plannedExports(first, state, now, TZ)).toEqual([]);
    const tomorrow = at('2026-11-09T10:00:00Z');
    expect(
      plannedExports(first, state, tomorrow, TZ).map((p) => p.year),
    ).toEqual([2026]);
  });

  it('fetches a year again, in full, when it was last fetched while still running', () => {
    const state: ExportState = {
      years: {
        '2026': {
          coveredTo: '2026-12-20T10:00:00.000Z',
          fetchedAt: '2026-12-20T10:00:00Z',
          rows: 1,
        },
      },
    };
    const plan = plannedExports(
      at('2026-12-25T00:00:00Z'),
      state,
      at('2027-01-02T10:00:00Z'),
      TZ,
    );
    expect(plan.map((p) => [p.year, p.to.toISOString()])).toEqual([
      [2026, '2026-12-31T21:59:59.000Z'],
      [2027, '2027-01-02T10:00:00.000Z'],
    ]);
  });

  it('needs no export without any activity', () => {
    expect(plannedExports(null, null, now, TZ)).toEqual([]);
  });
});

describe('coveredPeriod', () => {
  const first = at('2024-01-08T16:41:43Z');
  it('runs from the first year to where the fetched years stop being contiguous', () => {
    const state: ExportState = {
      years: {
        '2024': {
          coveredTo: '2024-12-31T21:59:59.000Z',
          fetchedAt: 'x',
          rows: 1,
        },
        '2025': {
          coveredTo: '2025-12-31T21:59:59.000Z',
          fetchedAt: 'x',
          rows: 1,
        },
        '2026': {
          coveredTo: '2026-11-08T20:00:00.000Z',
          fetchedAt: 'x',
          rows: 1,
        },
      },
    };
    expect(coveredPeriod(first, state, TZ)).toEqual({
      from: at('2023-12-31T22:00:00.000Z'),
      to: at('2026-11-08T20:00:00.000Z'),
    });
    delete state.years['2025'];
    expect(coveredPeriod(first, state, TZ)?.to).toEqual(
      at('2024-12-31T21:59:59.000Z'),
    );
    expect(coveredPeriod(first, { years: {} }, TZ)).toBeNull();
  });
});
