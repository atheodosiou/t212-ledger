/**
 * Who may sign up (closed beta).
 *
 *   npm run users -- invite someone@example.com
 *   npm run users -- uninvite someone@example.com   (only while not yet accepted)
 *   npm run users -- list
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/db.js';
import * as schema from '../db/schema.js';
import { UsersService } from '../users/users.service.js';

const [command, email] = process.argv.slice(2);
const conn = drizzle(process.env.DATABASE_URL!, { schema });
const db: Db = conn;
const users = new UsersService(db);

try {
  switch (command) {
    case 'invite': {
      const address = z.email().parse(email);
      await users.invite(address);
      console.log(`Invited ${address.toLowerCase()}`);
      break;
    }
    case 'uninvite': {
      const removed = await users.uninvite(z.email().parse(email));
      console.log(
        removed ? 'Invite removed' : 'No pending invite for that address',
      );
      break;
    }
    case 'list': {
      const invites = await users.listInvites();
      const members = await db
        .select({
          email: schema.users.email,
          lastSignInAt: schema.users.lastSignInAt,
        })
        .from(schema.users)
        .orderBy(asc(schema.users.createdAt));
      console.log('Users:');
      for (const u of members)
        console.log(
          `  ${u.email}  last sign-in ${u.lastSignInAt?.toISOString() ?? 'never'}`,
        );
      console.log('Pending invites:');
      for (const i of invites.filter((i) => !i.acceptedAt))
        console.log(`  ${i.email}  since ${i.createdAt.toISOString()}`);
      break;
    }
    default:
      console.error('Usage: npm run users -- invite|uninvite <email> | list');
      process.exitCode = 1;
  }
} finally {
  await conn.$client.end();
}
