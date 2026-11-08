import {
  AuthenticationStorage,
  type OidcProfile,
} from '@nestjs/authentication';
import { authenticationStoreContract } from '@nestjs/authentication/testing';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DrizzleAuthStore } from '../src/auth/drizzle-auth.store.js';
import {
  brokerAccounts,
  ledgerEntries,
  rawEvents,
  sessions,
  userIdentities,
  users,
} from '../src/db/schema.js';
import { HistorySyncService } from '../src/sync/history-sync.service.js';
import {
  SignInRefusedError,
  UsersService,
} from '../src/users/users.service.js';
import { cash, FakeT212 } from './fake-t212.js';
import {
  as,
  createTestApp,
  resetDb,
  seedAccount,
  signIn,
  type TestApp,
} from './helpers.js';

const google = (over: Partial<OidcProfile> = {}): OidcProfile => ({
  provider: 'google',
  subject: 'google-sub-1',
  email: 'New@Example.com',
  emailVerified: true,
  name: 'New Person',
  claims: {},
  ...over,
});

const count = async (t: TestApp, table: string) =>
  Number(
    (
      (await t.db.execute(sql.raw(`select count(*)::int as n from ${table}`)))
        .rows[0] as { n: number }
    ).n,
  );

describe('Sign-in, sessions and personal data', () => {
  let t: TestApp;
  const anonymous = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb(t.db);
  });

  describe('sessions', () => {
    it('requires a signed-in user everywhere except health and the sign-in routes', async () => {
      await anonymous().get('/api/accounts').expect(401);
      await anonymous().get('/api/auth/me').expect(401);
      await anonymous().get('/api/me/export').expect(401);
      await anonymous().get('/api/health').expect(200);
      const config = await anonymous().get('/api/auth/config').expect(200);
      expect(config.body).toEqual({
        google: false,
        devUser: 'e2e@localhost.test',
      });
    });

    it('signs in with the development user, and out again', async () => {
      const login = await anonymous().post('/api/auth/dev-login').expect(204);
      const setCookie = String(login.headers['set-cookie']);
      expect(setCookie).toMatch(/__Host-sid=/);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/Secure/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      const cookie = setCookie.split(';')[0];

      const me = await as(t, cookie).get('/api/auth/me').expect(200);
      expect(me.body).toMatchObject({ email: 'e2e@localhost.test' });
      expect(await count(t, 'sessions')).toBe(1);

      await as(t, cookie).post('/api/auth/logout').expect(204);
      await as(t, cookie).get('/api/auth/me').expect(401);
      expect(await count(t, 'sessions')).toBe(0);
    });

    it('stores only a hash of the session token', async () => {
      const cookie = await signIn(t);
      const token = decodeURIComponent(cookie.split('=')[1]);
      const [row] = await t.db.select().from(sessions);
      expect(row.id).not.toContain(token);
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it('refuses writes from another site (CSRF)', async () => {
      const cookie = await signIn(t);
      const account = await seedAccount(t, new FakeT212());
      await as(t, cookie)
        .post(`/api/accounts/${account.id}/sync`)
        .set('Origin', 'https://evil.example')
        .send({ full: false })
        .expect(403);
      await as(t, cookie)
        .post(`/api/accounts/${account.id}/sync`)
        .set('Origin', 'http://localhost:4200')
        .send({ full: false })
        .expect(202);
    });

    it('signs out every browser of the user', async () => {
      const one = await signIn(t);
      const two = await signIn(t);
      await as(t, one).post('/api/auth/logout-everywhere').expect(204);
      await as(t, two).get('/api/auth/me').expect(401);
      await as(t, one).get('/api/auth/me').expect(401);
    });
  });

  describe('who may sign in', () => {
    it('refuses an address the provider did not verify', async () => {
      await expect(
        t.app
          .get(UsersService)
          .resolveIdentity(google({ emailVerified: false })),
      ).rejects.toBeInstanceOf(SignInRefusedError);
      expect(await count(t, 'users')).toBe(0);
    });

    it('creates a user on the first sign-in, then recognises the identity by subject', async () => {
      const service = t.app.get(UsersService);
      const first = await service.resolveIdentity(google());
      expect(first).toMatchObject({
        email: 'new@example.com',
        name: 'New Person',
      });

      // Same Google account, new address at Google: still the same user.
      const again = await service.resolveIdentity(
        google({ email: 'changed@example.com' }),
      );
      expect(again.id).toBe(first.id);
      expect(await count(t, 'users')).toBe(1);
    });

    it('links Google to an existing user with the same verified address', async () => {
      await signIn(t, 'existing@example.com');
      const user = await t.app
        .get(UsersService)
        .resolveIdentity(google({ email: 'existing@example.com' }));
      const [identity] = await t.db.select().from(userIdentities);
      expect(identity).toMatchObject({
        provider: 'google',
        subject: 'google-sub-1',
        userId: user.id,
      });
    });
  });

  describe('personal data (GDPR)', () => {
    async function userWithHistory() {
      const fake = new FakeT212();
      fake.transactions = [cash('DEPOSIT', 100, '2026-01-01T10:00:00Z')];
      fake.cash = 100;
      const account = await seedAccount(t, fake);
      await t.app.get(HistorySyncService).run(account.id, false);
      return { account, cookie: await signIn(t) };
    }

    it('exports everything about the user, without the Trading 212 credentials', async () => {
      const { account, cookie } = await userWithHistory();
      const res = await as(t, cookie)
        .get('/api/me/export')
        .buffer(true)
        .parse((r, done) => {
          let body = '';
          r.on('data', (c: Buffer) => (body += c.toString()));
          r.on('end', () => done(null, body));
        })
        .expect(200);
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="t212-ledger-data-/,
      );
      const text = res.body as string;
      const data = JSON.parse(text);
      expect(data.user.email).toBe('e2e@localhost.test');
      expect(data.accounts).toHaveLength(1);
      expect(data.accounts[0].id).toBe(account.id);
      expect(data.accounts[0].tradingHistory).toHaveLength(1);
      expect(data.accounts[0].ledger).toHaveLength(1);
      expect(data.sessions).toHaveLength(1);
      expect(text).not.toMatch(/apiKeyEnc|apiSecretEnc|test-key|test-secret/);
    });

    it('erases the user only when they type their address', async () => {
      const { cookie } = await userWithHistory();
      await as(t, cookie)
        .delete('/api/me')
        .send({ confirmEmail: 'someone-else@example.com' })
        .expect(400);
      expect(await count(t, 'users')).toBe(1);
    });

    it('erases the user, their accounts, history, identities and sessions', async () => {
      const { cookie } = await userWithHistory();
      const other = await seedAccount(t, new FakeT212(), {
        email: 'other@example.com',
      });
      const [me] = await t.db
        .select()
        .from(users)
        .where(eq(users.email, 'e2e@localhost.test'));
      await t.db
        .insert(userIdentities)
        .values({ provider: 'google', subject: 'x', userId: me.id });
      const second = await signIn(t);

      const res = await as(t, cookie)
        .delete('/api/me')
        .send({ confirmEmail: ' E2E@localhost.test ' })
        .expect(204);
      expect(String(res.headers['set-cookie'])).toMatch(/__Host-sid=;/);

      await as(t, cookie).get('/api/auth/me').expect(401);
      await as(t, second).get('/api/auth/me').expect(401);
      const left = await t.db.select().from(users);
      expect(left.map((u) => u.email)).toEqual(['other@example.com']);
      expect(
        (await t.db.select().from(brokerAccounts)).map((a) => a.id),
      ).toEqual([other.id]);
      expect(await t.db.select().from(rawEvents)).toEqual([]);
      expect(await t.db.select().from(ledgerEntries)).toEqual([]);
      expect(await t.db.select().from(userIdentities)).toEqual([]);
      expect(
        await t.db.select().from(sessions).where(eq(sessions.userId, me.id)),
      ).toEqual([]);
    });
  });
});

describe('DrizzleAuthStore', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());

  class SmallStore extends DrizzleAuthStore {
    protected override maxPending = 3;
  }

  const cases = authenticationStoreContract(
    async () => {
      await t.db.execute(sql`truncate sessions, oidc_logins`);
      const store = new SmallStore(t.db, new AuthenticationStorage());
      return { sessions: store, oidcStates: store };
    },
    { contracts: ['sessions', 'oidcStates'], concurrent: true, maxPending: 3 },
  );
  for (const c of cases) it(c.name, () => c.run());
});
