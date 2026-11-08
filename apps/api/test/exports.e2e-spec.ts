import { and, eq } from 'drizzle-orm';
import { brokerAccounts, ledgerEntries, rawEvents } from '../src/db/schema.js';
import { ExportsService } from '../src/exports/exports.service.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { HistorySyncService } from '../src/sync/history-sync.service.js';
import {
  buyOrSell,
  cash,
  dividend,
  FakeT212,
  newestFirst,
} from './fake-t212.js';
import {
  as,
  createTestApp,
  resetDb,
  seedAccount,
  signIn,
  type TestApp,
} from './helpers.js';

/**
 * A live account with what made the real one differ from the API alone: a card deposit
 * (amount charged + fee), a dividend whose tax only the export states, and a refund of
 * withheld tax that the API sends as a plain deposit.
 */
function liveHistory() {
  const fake = new FakeT212();
  const deposit = cash('DEPOSIT', 1007, '2025-01-11T13:23:49.000Z');
  const depositFee = cash('FEE', -7, '2025-01-11T13:23:49.000Z');
  const refund = cash('DEPOSIT', 0.08, '2026-04-06T16:09:27.000Z');
  fake.transactions = newestFirst([deposit, depositFee, refund]);
  fake.orders = newestFirst([
    buyOrSell('BUY', {
      quantity: 10,
      price: 50,
      netValue: 455.5,
      fee: 0.68,
      at: '2025-02-01T15:00:00.000Z',
    }),
    buyOrSell('SELL', {
      quantity: 4,
      price: 60,
      netValue: 217.5,
      fee: 0.33,
      at: '2026-03-01T15:00:00.000Z',
    }),
  ]);
  fake.dividends = newestFirst([
    dividend({
      at: '2025-12-01T10:00:00.000Z',
      quantity: 7,
      amount: 1.83,
      withheld: 0.78,
    }),
  ]);
  fake.exportExtraRows = [
    {
      Action: 'Dividend adjustment',
      'Time (UTC)': '2026-04-06 16:09:27',
      Notes: '2025 US dividends withholding tax adjustment.',
      ID: refund.reference,
      Total: '0.08',
      'Currency (Total)': 'EUR',
    },
  ];
  fake.cash = 1000 - 455.5 + 217.5 + 1.83 + 0.08;
  return { fake, refund };
}

describe('Trading 212 export', () => {
  let t: TestApp;
  let exports: ExportsService;
  const now = new Date('2026-11-08T20:00:00Z');

  beforeAll(async () => {
    t = await createTestApp();
    exports = t.app.get(ExportsService);
    exports.pollMs = 1;
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb(t.db);
  });

  async function syncedLiveAccount() {
    const { fake, refund } = liveHistory();
    const account = await seedAccount(t, fake, { environment: 'LIVE' });
    await t.app.get(HistorySyncService).run(account.id, false);
    return { fake, refund, account };
  }

  it('fetches one export per year, checks the history against it line by line', async () => {
    const { fake, account } = await syncedLiveAccount();
    await exports.run(account.id, undefined, now);

    expect(fake.exportRequests).toEqual([
      { from: '2024-12-31T22:00:00.000Z', to: '2025-12-31T21:59:59.000Z' },
      { from: '2025-12-31T22:00:00.000Z', to: '2026-11-08T20:00:00.000Z' },
    ]);
    const [stored] = await t.db
      .select()
      .from(brokerAccounts)
      .where(eq(brokerAccounts.id, account.id));
    expect(stored.exportState?.years).toMatchObject({
      '2025': { coveredTo: '2025-12-31T21:59:59.000Z' },
      '2026': { coveredTo: '2026-11-08T20:00:00.000Z' },
    });
    expect(stored.exportState?.blocked).toBeNull();
    expect(stored.exportCheck).toMatchObject({
      ok: true,
      compared: { orders: 2, dividends: 1, cash: 2 },
      differences: [],
    });
  });

  it('never asks again for a year that ended, and for the running one at most daily', async () => {
    const { fake, account } = await syncedLiveAccount();
    await exports.run(account.id, undefined, now);
    await exports.run(account.id, undefined, new Date('2026-11-08T23:00:00Z'));
    expect(fake.exportRequests).toHaveLength(2);
    await exports.run(account.id, undefined, new Date('2026-11-09T21:00:00Z'));
    expect(fake.exportRequests).toHaveLength(3);
    expect(fake.exportRequests[2].from).toBe('2025-12-31T22:00:00.000Z');
  });

  it('turns the tax refund the API calls a deposit into a dividend adjustment', async () => {
    const { refund, account } = await syncedLiveAccount();
    await exports.run(account.id, undefined, now);
    const [entry] = await t.db
      .select({
        kind: ledgerEntries.kind,
        sourceType: ledgerEntries.sourceType,
        note: ledgerEntries.note,
      })
      .from(ledgerEntries)
      .innerJoin(rawEvents, eq(rawEvents.id, ledgerEntries.rawEventId))
      .where(
        and(
          eq(ledgerEntries.accountId, account.id),
          eq(rawEvents.externalId, refund.reference),
        ),
      );
    expect(entry).toEqual({
      kind: 'DIVIDEND',
      sourceType: 'DIVIDEND_ADJUSTMENT',
      note: '2025 US dividends withholding tax adjustment.',
    });

    // And a rebuild of the ledger keeps it.
    await t.app.get(LedgerService).rebuild(account.id);
    const report = await t.app.get(LedgerService).report(account.id, 'AVERAGE');
    expect(report.dividends.map((d) => [d.source, d.net, d.withheld])).toEqual([
      ['export', '1.83', '0.7800'],
      ['adjustment', '0.08', '-0.08'],
    ]);
    const y2026 = report.years.find((y) => y.year === 2026)!;
    expect(y2026.deposits).toBe('0');
    const y2025 = report.years.find((y) => y.year === 2025)!;
    expect(y2025).toMatchObject({ deposits: '1000', depositFees: '7' });
  });

  it('reports a history that disagrees with the export', async () => {
    const { fake, account } = await syncedLiveAccount();
    // The export shows a deposit the API never returned.
    fake.exportExtraRows.push({
      Action: 'Deposit',
      'Time (UTC)': '2026-05-01 10:00:00',
      ID: 'only-in-export',
      Total: '50.00',
      'Currency (Total)': 'EUR',
    });
    await exports.run(account.id, undefined, now);
    const [stored] = await t.db
      .select()
      .from(brokerAccounts)
      .where(eq(brokerAccounts.id, account.id));
    expect(stored.exportCheck?.ok).toBe(false);
    expect(stored.exportCheck?.differences).toEqual([
      expect.objectContaining({ kind: 'missing-from-api', date: '2026-05-01' }),
    ]);
  });

  it('says why when exports are not possible, and asks nothing of practice accounts', async () => {
    const practice = new FakeT212();
    practice.transactions = [cash('DEPOSIT', 100, '2026-01-01T10:00:00.000Z')];
    const demo = await seedAccount(t, practice, { label: 'Practice' });
    await t.app.get(HistorySyncService).run(demo.id, false);
    await exports.run(demo.id, undefined, now);
    expect(practice.exportRequests).toEqual([]);
    const [d] = await t.db
      .select()
      .from(brokerAccounts)
      .where(eq(brokerAccounts.id, demo.id));
    expect(d.exportState?.blocked?.reason).toBe('demo');

    const { fake, account } = await syncedLiveAccount();
    fake.exportStatus = 403;
    await exports.run(account.id, undefined, now);
    const [l] = await t.db
      .select()
      .from(brokerAccounts)
      .where(eq(brokerAccounts.id, account.id));
    expect(l.exportState?.blocked?.reason).toBe('permission');
    // The account still works on the API alone: the dividend tax is the estimate.
    const report = await t.app.get(LedgerService).report(account.id, 'AVERAGE');
    expect(report.dividends[0].source).toBe('api');
  });

  it('shows the check and the export state with the account', async () => {
    const { account } = await syncedLiveAccount();
    await exports.run(account.id, undefined, now);
    const res = await as(t, await signIn(t))
      .get(`/api/accounts/${account.id}`)
      .expect(200);
    expect(res.body.exportCheck).toMatchObject({ ok: true });
    // Deposit, buy and dividend: the deposit fee is a column of the deposit row.
    expect(res.body.exportState.years['2025'].rows).toBe(3);
    expect(JSON.stringify(res.body)).not.toMatch(/apiKeyEnc|apiSecretEnc/);
  });
});
