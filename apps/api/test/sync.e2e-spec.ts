import { HistorySyncService } from '../src/sync/history-sync.service.js';
import { buyOrSell, cash, FakeT212, newestFirst } from './fake-t212.js';
import {
  counts,
  createTestApp,
  reload,
  resetDb,
  seedAccount,
  type TestApp,
} from './helpers.js';

/** A small but realistic account: 2 deposits, 3 buys, 1 sell of ASTS. */
function history(fake: FakeT212) {
  fake.transactions = newestFirst([
    cash('DEPOSIT', 1000, '2026-01-02T10:00:00Z'),
    cash('FEE', -7, '2026-01-02T10:00:00Z'),
    cash('DEPOSIT', 500, '2026-02-02T10:00:00Z'),
    cash('INTEREST_ON_FREE_CASH', 0.12, '2026-03-01T00:00:00Z'),
  ]);
  fake.orders = newestFirst([
    buyOrSell('BUY', {
      quantity: 10,
      price: 30,
      netValue: 300.5,
      fee: 0.5,
      at: '2026-01-05T15:00:00Z',
    }),
    buyOrSell('BUY', {
      quantity: 10,
      price: 20,
      netValue: 200.4,
      fee: 0.4,
      at: '2026-02-05T15:00:00Z',
    }),
    buyOrSell('SELL', {
      quantity: 5,
      price: 40,
      netValue: 199.6,
      fee: 0.4,
      at: '2026-03-05T15:00:00Z',
    }),
    buyOrSell('BUY', {
      quantity: 2,
      price: 25,
      netValue: 50.1,
      fee: 0.1,
      at: '2026-04-05T15:00:00Z',
    }),
  ]);
  // Cash: 1000 - 7 + 500 + 0.12 - 300.5 - 200.4 + 199.6 - 50.1 = 1141.72; shares: 10 + 10 - 5 + 2 = 17
  fake.cash = 1141.72;
  fake.positionsNow = [
    {
      instrument: {
        ticker: 'NPA_US_EQ',
        isin: 'US00217D1000',
        name: 'AST SpaceMobile',
        currency: 'USD',
      },
      quantity: 17,
      averagePricePaid: 1,
      currentPrice: 1,
      walletImpact: {
        currency: 'EUR',
        currentValue: 500,
        totalCost: 500,
        unrealizedProfitLoss: 0,
      },
    },
  ];
}

describe('sync against a real database', () => {
  let t: TestApp;
  let sync: HistorySyncService;

  beforeAll(async () => {
    t = await createTestApp();
    sync = t.app.get(HistorySyncService);
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb(t.db);
  });

  it('first sync stores the whole history, builds the ledger and matches Trading 212', async () => {
    const fake = new FakeT212();
    history(fake);
    const account = await seedAccount(t, fake);

    await sync.run(account.id, false);

    const after = await reload(t, account.id);
    expect(after.syncStatus).toBe('IDLE');
    expect(await counts(t, account.id)).toEqual({ raw: 8, ledger: 8 });
    expect(after.syncState).toEqual({
      ORDER: { backfillDone: true, resume: null },
      DIVIDEND: { backfillDone: true, resume: null },
      TRANSACTION: { backfillDone: true, resume: null },
    });
    expect(after.reconciliation).toMatchObject({
      ok: true,
      compared: { positions: 1, cashLedger: '1141.72' },
    });
  });

  it('a routine sync with nothing new downloads one small page per stream and writes nothing', async () => {
    const fake = new FakeT212();
    history(fake);
    const account = await seedAccount(t, fake);
    await sync.run(account.id, false);
    const firstCheck = (await reload(t, account.id)).reconciliation!.checkedAt;
    fake.requests = [];

    await sync.run(account.id, false);

    expect(fake.historyRequests()).toEqual([
      '/api/v0/equity/history/orders?limit=10',
      '/api/v0/equity/history/dividends?limit=10',
      '/api/v0/equity/history/transactions?limit=10',
    ]);
    expect(fake.requests).not.toContain('/positions'); // no new data, recent check: no reconciliation calls
    expect(await counts(t, account.id)).toEqual({ raw: 8, ledger: 8 });
    expect((await reload(t, account.id)).reconciliation!.checkedAt).toBe(
      firstCheck,
    );
  });

  it('a new fill is appended to the ledger and checked again', async () => {
    const fake = new FakeT212();
    history(fake);
    const account = await seedAccount(t, fake);
    await sync.run(account.id, false);

    fake.orders = newestFirst([
      ...fake.orders,
      buyOrSell('BUY', {
        quantity: 1,
        price: 30,
        netValue: 27.3,
        fee: 0.03,
        at: '2026-05-05T15:00:00Z',
      }),
    ]);
    fake.cash = Number((1141.72 - 27.3).toFixed(2));
    fake.positionsNow[0].quantity = 18;

    await sync.run(account.id, false);

    expect(await counts(t, account.id)).toEqual({ raw: 9, ledger: 9 });
    expect((await reload(t, account.id)).reconciliation).toMatchObject({
      ok: true,
      compared: { cashLedger: '1114.42' },
    });
  });

  it('an interrupted first sync resumes without downloading stored pages again', async () => {
    const fake = new FakeT212();
    history(fake);
    // 120 more deposits so the transaction stream has three pages of 50.
    fake.transactions = newestFirst([
      ...fake.transactions,
      ...Array.from({ length: 120 }, (_, i) =>
        cash('DEPOSIT', 1, new Date(Date.UTC(2025, 0, 1, 0, i)).toISOString()),
      ),
    ]);
    fake.cash += 120;
    const account = await seedAccount(t, fake);
    // Requests: 1 orders, 2 dividends, 3 transactions page 1, 4 transactions page 2 -> fails.
    fake.failAt = 4;

    await expect(sync.run(account.id, false)).rejects.toThrow('network down');
    const failed = await reload(t, account.id);
    expect(failed.syncStatus).toBe('FAILED');
    expect(failed.syncState!.TRANSACTION).toEqual({
      backfillDone: false,
      resume: '/api/v0/equity/history/transactions?cursor=50&limit=50',
    });

    fake.requests = [];
    await sync.run(account.id, false);

    expect(
      fake.historyRequests().filter((r) => r.includes('transactions')),
    ).toEqual([
      '/api/v0/equity/history/transactions?limit=10', // "anything new at the top?"
      '/api/v0/equity/history/transactions?cursor=50&limit=50', // resume
      '/api/v0/equity/history/transactions?cursor=100&limit=50',
    ]);
    expect(await counts(t, account.id)).toEqual({ raw: 128, ledger: 128 });
    expect((await reload(t, account.id)).reconciliation!.ok).toBe(true);
  });

  it('waits out a rate limit instead of failing', async () => {
    const fake = new FakeT212();
    history(fake);
    const account = await seedAccount(t, fake);
    fake.rateLimitAt = 2;

    await sync.run(account.id, false);

    expect((await reload(t, account.id)).syncStatus).toBe('IDLE');
    expect(await counts(t, account.id)).toEqual({ raw: 8, ledger: 8 });
  });

  it('flags a share-count mismatch with Trading 212', async () => {
    const fake = new FakeT212();
    history(fake);
    fake.positionsNow[0].quantity = 16; // e.g. a fill missing from the history
    const account = await seedAccount(t, fake);

    await sync.run(account.id, false);

    const { reconciliation } = await reload(t, account.id);
    expect(reconciliation!.ok).toBe(false);
    expect(reconciliation!.issues).toEqual([
      expect.objectContaining({ kind: 'position', severity: 'error' }),
    ]);
    expect(reconciliation!.issues[0].message).toContain('ASTS');
  });

  it('keeps a record of unexpected shape out of the figures and reports it', async () => {
    const fake = new FakeT212();
    history(fake);
    fake.transactions = newestFirst([
      ...fake.transactions,
      {
        type: 'DEPOSIT',
        amount: '25',
        currency: 'EUR',
        dateTime: '2026-06-01T00:00:00Z',
        reference: 'odd',
      },
    ]);
    fake.cash += 25; // Trading 212 counted it; we refuse to guess, so cash disagrees too
    const account = await seedAccount(t, fake);

    await sync.run(account.id, false);

    expect(await counts(t, account.id)).toEqual({ raw: 9, ledger: 8 });
    const { reconciliation } = await reload(t, account.id);
    expect(reconciliation!.issues.map((i) => i.kind).sort()).toEqual([
      'cash',
      'unreadable',
    ]);
  });
});
