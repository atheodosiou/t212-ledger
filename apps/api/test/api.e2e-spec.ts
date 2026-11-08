import request from 'supertest';
import { HistorySyncService } from '../src/sync/history-sync.service.js';
import { buyOrSell, cash, FakeT212, newestFirst } from './fake-t212.js';
import {
  as,
  createTestApp,
  resetDb,
  seedAccount,
  signIn,
  type TestApp,
} from './helpers.js';

describe('HTTP API', () => {
  let t: TestApp;
  let cookie: string;
  const anonymous = () => request(t.app.getHttpServer());
  const http = () => as(t, cookie);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb(t.db);
    cookie = await signIn(t);
  });

  it('reports health without needing an account', async () => {
    const res = await anonymous().get('/api/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'up' }, queue: { status: 'up' } },
    });
  });

  it('sends security headers', async () => {
    const res = await anonymous().get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('never echoes API keys back in validation errors', async () => {
    const secret = 'SECRET-sk-should-never-appear';
    const res = await http()
      .post('/api/accounts')
      .send({
        label: 'x',
        environment: 'LIVE',
        apiKey: 'short',
        apiSecret: secret.repeat(10),
      })
      .expect(400);
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
    expect(JSON.stringify(res.body)).not.toContain('short');
  });

  it('rate limits account creation to 5 attempts a minute', async () => {
    // Other tests in this file may already have used part of the minute's budget,
    // so assert the shape rather than an exact position: invalid attempts are
    // answered with 400 until the limit, then everything is refused with 429.
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await http().post('/api/accounts').send({})).status);
    }
    const firstRefused = statuses.indexOf(429);
    expect(firstRefused).toBeGreaterThan(-1);
    expect(firstRefused).toBeLessThanOrEqual(5);
    expect(statuses.slice(0, firstRefused).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(firstRefused).every((s) => s === 429)).toBe(true);
  });

  it("does not show another user's account", async () => {
    const other = await seedAccount(t, new FakeT212(), {
      email: 'someone-else@localhost.test',
    });
    await http().get(`/api/accounts/${other.id}`).expect(404);
    await http().get(`/api/accounts/${other.id}/ledger`).expect(404);
    const list = await http().get('/api/accounts').expect(200);
    expect(list.body).toEqual([]);
  });

  it('pages, filters and sorts the ledger in the database', async () => {
    const fake = new FakeT212();
    fake.transactions = newestFirst([
      cash('DEPOSIT', 100, '2026-01-01T10:00:00Z'),
      cash('DEPOSIT', 300, '2026-01-02T10:00:00Z'),
      cash('DEPOSIT', 200, '2026-01-03T10:00:00Z'),
    ]);
    fake.orders = newestFirst([
      buyOrSell('BUY', {
        quantity: 1,
        price: 10,
        netValue: 9.1,
        at: '2026-01-04T10:00:00Z',
      }),
    ]);
    fake.cash = 590.9;
    const account = await seedAccount(t, fake);
    await t.app.get(HistorySyncService).run(account.id, false);

    const page1 = await http()
      .get(`/api/accounts/${account.id}/ledger?limit=2&sort=cash&dir=desc`)
      .expect(200);
    expect(page1.body).toMatchObject({ total: 4, nextOffset: 2 });
    expect(
      page1.body.items.map((e: { cashAmount: string }) => Number(e.cashAmount)),
    ).toEqual([300, 200]);

    const page2 = await http()
      .get(
        `/api/accounts/${account.id}/ledger?limit=2&offset=2&sort=cash&dir=desc`,
      )
      .expect(200);
    expect(
      page2.body.items.map((e: { cashAmount: string }) => Number(e.cashAmount)),
    ).toEqual([100, -9.1]);
    expect(page2.body.nextOffset).toBeNull();

    const buys = await http()
      .get(`/api/accounts/${account.id}/ledger?kind=BUY&q=ast`)
      .expect(200);
    expect(buys.body).toMatchObject({ total: 1, items: [{ kind: 'BUY' }] });

    await http()
      .get(`/api/accounts/${account.id}/ledger?sort=nonsense`)
      .expect(400);
  });

  it('exports a PDF and an Excel file', async () => {
    const fake = new FakeT212();
    fake.transactions = [cash('DEPOSIT', 100, '2026-01-01T10:00:00Z')];
    fake.cash = 100;
    const account = await seedAccount(t, fake);
    await t.app.get(HistorySyncService).run(account.id, false);

    const pdf = await http()
      .get(`/api/accounts/${account.id}/export?format=pdf&year=2026`)
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');

    const xlsx = await http()
      .get(`/api/accounts/${account.id}/export?format=xlsx`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // a zip, as .xlsx files are
  });

  it('waits out a rate limit on one live endpoint without spending the other', async () => {
    // Each endpoint answers once per window, and the summary is limited on the first
    // call (another client used it a moment ago). Repeating both calls would hit the
    // positions limit; only the limited call may be repeated.
    const fake = new FakeT212();
    fake.transactions = [cash('DEPOSIT', 100, '2026-01-01T10:00:00Z')];
    fake.cash = 100;
    // No sync: its reconciliation would leave a cached snapshot behind.
    const account = await seedAccount(t, fake);
    fake.liveWindowMs = 1_000;
    fake.rateLimitAt = 1;

    const res = await http()
      .get(`/api/accounts/${account.id}/portfolio`)
      .expect(200);
    expect(res.body).toMatchObject({ stale: false });
    expect(fake.requests.filter((r) => r === '/positions')).toHaveLength(1);
    expect(fake.requests.filter((r) => r === '/summary')).toHaveLength(2);
  });
});
