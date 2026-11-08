import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import pg from 'pg';

const TEST_DB = 't212_ledger_test';

/** Creates a fresh test database and applies every migration, as production would. */
export default async function setup(): Promise<() => Promise<void>> {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL!;
  if (!process.env.DATABASE_URL?.endsWith(`/${TEST_DB}`)) {
    throw new Error(`Refusing to run: DATABASE_URL must point at ${TEST_DB}`);
  }

  const admin = new pg.Client(adminUrl);
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const db = drizzle(process.env.DATABASE_URL);
  await migrate(db, {
    migrationsFolder: join(import.meta.dirname, '../drizzle'),
  });
  await db.$client.end();

  return async () => {
    const cleanup = new pg.Client(adminUrl);
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${TEST_DB} with (force)`);
    await cleanup.end();
  };
}
