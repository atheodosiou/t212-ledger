import { randomBytes } from 'node:crypto';
import { defineConfig } from 'vitest/config';

// Integration tests run against a real Postgres, in a database of their own that is
// dropped and recreated on every run (see test/global-setup.ts). They never touch
// t212_ledger. Locally that is the docker compose database; in CI, a service container.
const admin =
  process.env.TEST_DATABASE_ADMIN_URL ??
  'postgres://t212:t212@127.0.0.1:5433/postgres';
const testDb = new URL(admin);
testDb.pathname = '/t212_ledger_test';

const env = {
  TEST_DATABASE_ADMIN_URL: admin,
  DATABASE_URL: testDb.toString(),
  CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  HOST: '127.0.0.1',
};
// The global setup runs in this process, the tests in workers: both need the same values.
Object.assign(process.env, env);

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    // One database for all files: run them one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env,
  },
});
