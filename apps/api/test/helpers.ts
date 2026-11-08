import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDrizzleToken } from '@nestjs/drizzle';
import { eq, sql } from 'drizzle-orm';
import { AccountsService } from '../src/accounts/accounts.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import type { Db } from '../src/db/db.js';
import { brokerAccounts, users, type BrokerAccount } from '../src/db/schema.js';
import { SyncQueueService } from '../src/sync/sync-queue.service.js';
import type { FakeT212 } from './fake-t212.js';

export interface TestApp {
  app: INestApplication;
  db: Db;
  enqueue: ReturnType<typeof vi.fn>;
}

/**
 * The real application against the test database, configured exactly like main.ts.
 * Only the job queue is replaced: tests call the sync directly instead of waiting on
 * a background worker.
 */
export async function createTestApp(): Promise<TestApp> {
  const enqueue = vi.fn(async () => true);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SyncQueueService)
    .useValue({ enqueue, healthy: async () => true })
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return { app, db: app.get<Db>(getDrizzleToken()), enqueue };
}

/** Empties every table, so each test starts from nothing. */
export async function resetDb(db: Db): Promise<void> {
  await db.execute(
    sql`truncate users, instruments, app_state restart identity cascade`,
  );
}

/** A connected account whose Trading 212 calls go to `fake`. */
export async function seedAccount(
  t: TestApp,
  fake: FakeT212,
  options: { email?: string; label?: string } = {},
): Promise<BrokerAccount> {
  const encryption = t.app.get(EncryptionService);
  const email = options.email ?? process.env.DEV_USER_EMAIL!;
  const [user] = await t.db
    .insert(users)
    .values({ email })
    .onConflictDoUpdate({ target: users.email, set: { email } })
    .returning();
  const [account] = await t.db
    .insert(brokerAccounts)
    .values({
      userId: user.id,
      label: options.label ?? 'Test',
      environment: 'DEMO',
      apiKeyEnc: encryption.encrypt('test-key-0000000000'),
      apiSecretEnc: encryption.encrypt('test-secret-0000000000'),
    })
    .returning();

  const accounts = t.app.get(AccountsService);
  const original = accounts.clientFor.bind(accounts);
  vi.spyOn(accounts, 'clientFor').mockImplementation((a) =>
    a.id === account.id ? fake.client() : original(a),
  );
  return account;
}

export async function reload(
  t: TestApp,
  accountId: string,
): Promise<BrokerAccount> {
  const [account] = await t.db
    .select()
    .from(brokerAccounts)
    .where(eq(brokerAccounts.id, accountId));
  return account;
}

/** Row counts used to prove a sync wrote nothing. */
export async function counts(t: TestApp, accountId: string) {
  const one = async (table: string) =>
    Number(
      (
        (
          await t.db.execute(
            sql.raw(
              `select count(*)::int as n from ${table} where account_id = '${accountId}'`,
            ),
          )
        ).rows[0] as {
          n: number;
        }
      ).n,
    );
  return { raw: await one('raw_events'), ledger: await one('ledger_entries') };
}
