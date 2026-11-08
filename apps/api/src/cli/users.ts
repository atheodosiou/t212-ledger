/**
 * Who has signed up.
 *
 *   npm run users -- list
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { asc } from 'drizzle-orm';
import * as schema from '../db/schema.js';

const [command] = process.argv.slice(2);
const conn = drizzle(process.env.DATABASE_URL!, { schema });

try {
  if (command === 'list') {
    const members = await conn
      .select({
        email: schema.users.email,
        createdAt: schema.users.createdAt,
        lastSignInAt: schema.users.lastSignInAt,
      })
      .from(schema.users)
      .orderBy(asc(schema.users.createdAt));
    for (const u of members) {
      console.log(
        `${u.email}  since ${u.createdAt.toISOString()}  last sign-in ${u.lastSignInAt?.toISOString() ?? 'never'}`,
      );
    }
    console.log(`${members.length} user(s)`);
  } else {
    console.error('Usage: npm run users -- list');
    process.exitCode = 1;
  }
} finally {
  await conn.$client.end();
}
