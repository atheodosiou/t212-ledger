/**
 * Re-encrypts every stored Trading 212 credential under CREDENTIAL_ENCRYPTION_KEY.
 * Run it after moving the previous key to CREDENTIAL_ENCRYPTION_KEYS_OLD (README,
 * "Rotating the encryption key").
 *
 *   npm run credentials:rotate -- --dry-run   counts only
 *   npm run credentials:rotate
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { validateEnv } from '../config/env.js';
import { Keyring } from '../crypto/encryption.service.js';
import type { Db } from '../db/db.js';
import * as schema from '../db/schema.js';

const dryRun = process.argv.includes('--dry-run');
const env = validateEnv(process.env);
const ring = new Keyring(
  env.CREDENTIAL_ENCRYPTION_KEY,
  env.CREDENTIAL_ENCRYPTION_KEYS_OLD,
);
const conn = drizzle(env.DATABASE_URL, { schema });
const db: Db = conn;
const { brokerAccounts } = schema;

let current = 0;
let rotated = 0;
let failed = 0;
try {
  const rows = await db
    .select({
      id: brokerAccounts.id,
      apiKeyEnc: brokerAccounts.apiKeyEnc,
      apiSecretEnc: brokerAccounts.apiSecretEnc,
    })
    .from(brokerAccounts);

  for (const row of rows) {
    if (
      !ring.needsRotation(row.apiKeyEnc) &&
      !ring.needsRotation(row.apiSecretEnc)
    ) {
      current++;
      continue;
    }
    let key: string;
    let secret: string;
    try {
      key = ring.decrypt(row.apiKeyEnc);
      secret = ring.decrypt(row.apiSecretEnc);
    } catch (error) {
      failed++;
      console.error(`Account ${row.id}: ${(error as Error).message}`);
      continue;
    }
    if (dryRun) {
      rotated++;
      continue;
    }
    // Only if nobody changed the row meanwhile.
    const updated = await db
      .update(brokerAccounts)
      .set({ apiKeyEnc: ring.encrypt(key), apiSecretEnc: ring.encrypt(secret) })
      .where(
        and(
          eq(brokerAccounts.id, row.id),
          eq(brokerAccounts.apiKeyEnc, row.apiKeyEnc),
          eq(brokerAccounts.apiSecretEnc, row.apiSecretEnc),
        ),
      )
      .returning({ id: brokerAccounts.id });
    if (updated.length) rotated++;
    else console.warn(`Account ${row.id} changed while rotating; run again`);
  }

  console.log(
    `${dryRun ? '[dry run] would re-encrypt' : 'Re-encrypted'} ${rotated}, already on key ${ring.currentKeyId}: ${current}, unreadable: ${failed}`,
  );
  if (failed) process.exitCode = 1;
} finally {
  await conn.$client.end();
}
