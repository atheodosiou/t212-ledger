import type { T212Position } from '../trading212/t212.types.js';
import { checkRaw } from '../ledger/raw-schemas.js';
import { needsCheck, reconcile, type ReconcileInput } from './reconcile.js';

const position = (ticker: string, isin: string, quantity: number): T212Position => ({
  instrument: { ticker, isin, name: ticker, currency: 'USD' },
  quantity,
  averagePricePaid: 1,
  currentPrice: 1,
  walletImpact: { currency: 'EUR', currentValue: 1, totalCost: 1, unrealizedProfitLoss: 0 },
});

const holding = (ticker: string, isin: string, quantity: string) => ({
  ticker,
  isin,
  instrumentName: ticker,
  quantity,
  costBasis: '1',
  averageCost: '1',
});

// The real account on 2026-11-08: 5 positions, 0.43 cash.
const base: ReconcileInput = {
  holdings: [holding('ASTS', 'US00217D1000', '58.36416374'), holding('BTDR', 'KYG114481008', '335.94565629')],
  positions: [position('NPA_US_EQ', 'US00217D1000', 58.36416374), position('BSGA_US_EQ', 'KYG114481008', 335.94565629)],
  summary: { totalValue: 0, cash: { availableToTrade: 0.42, reservedForOrders: 0, inPies: 0.01 } },
  ledgerCash: '0.43',
  displayTickers: new Map([
    ['NPA_US_EQ', 'ASTS'],
    ['BSGA_US_EQ', 'BTDR'],
  ]),
  unreadable: [],
  unmapped: [],
  warnings: [],
  now: new Date('2026-11-08T12:00:00Z'),
};

describe('reconcile', () => {
  it('passes when shares and cash match', () => {
    const r = reconcile(base);
    expect(r).toMatchObject({ ok: true, issues: [], compared: { positions: 2, cashLedger: '0.43', cashBroker: '0.43' } });
  });

  it('reports a missing fill as a share-count mismatch, under the market ticker', () => {
    const r = reconcile({ ...base, holdings: [holding('ASTS', 'US00217D1000', '57.36416374'), base.holdings[1]] });
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ kind: 'position', severity: 'error' });
    expect(r.issues[0].message).toContain('ASTS');
  });

  it('reports positions only one side knows about', () => {
    const r = reconcile({ ...base, positions: [base.positions[0]] });
    expect(r.issues.map((i) => i.message)).toEqual([expect.stringContaining('BTDR: το ιστορικό δείχνει')]);
  });

  it('allows a few cents of cash rounding, not more', () => {
    expect(reconcile({ ...base, ledgerCash: '0.47' }).ok).toBe(true);
    const r = reconcile({ ...base, ledgerCash: '5.38' });
    expect(r.issues).toEqual([expect.objectContaining({ kind: 'cash', severity: 'error' })]);
  });

  it('treats unreadable records as errors and unknown types or history oddities as warnings', () => {
    const r = reconcile({
      ...base,
      unreadable: [{ source: 'TRANSACTION', externalId: 'x', problem: 'amount: expected number' }],
      unmapped: [{ sourceType: 'CARD_CASHBACK', count: 2 }],
      warnings: [{ entryId: 'e', date: new Date(), message: 'X: sold 1 more shares than the history shows were bought' }],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => [i.kind, i.severity])).toEqual([
      ['unreadable', 'error'],
      ['unmapped', 'warning'],
      ['history', 'warning'],
    ]);
  });

  it('is still ok with warnings only', () => {
    expect(reconcile({ ...base, unmapped: [{ sourceType: 'CARD_CASHBACK', count: 1 }] }).ok).toBe(true);
  });
});

describe('needsCheck', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  const done = { ...reconcile(base), checkedAt: '2026-11-08T10:00:00Z' };

  it('checks after new data, the first time, or after a failed attempt', () => {
    expect(needsCheck(done, 3, now)).toBe(true);
    expect(needsCheck(null, 0, now)).toBe(true);
    expect(needsCheck({ ...done, stale: true }, 0, now)).toBe(true);
  });

  it('skips a routine sync with nothing new, unless the last check is a day old', () => {
    expect(needsCheck(done, 0, now)).toBe(false);
    expect(needsCheck({ ...done, checkedAt: '2026-11-07T11:00:00Z' }, 0, now)).toBe(true);
  });
});

describe('checkRaw', () => {
  it('accepts real record shapes and rejects a changed field', () => {
    const tx = { amount: 201.4, currency: 'EUR', dateTime: '2026-11-02T10:00:00Z', reference: 'r', type: 'DEPOSIT' };
    expect(checkRaw('TRANSACTION', tx)).toBeNull();
    expect(checkRaw('TRANSACTION', { ...tx, extraField: 1 })).toBeNull();
    expect(checkRaw('TRANSACTION', { ...tx, amount: '201.4' })).toContain('amount');
    expect(checkRaw('ORDER', { order: { id: 1, side: 'BUY', ticker: 'X', createdAt: 'not a date' }, fill: null })).toContain(
      'createdAt',
    );
  });
});
