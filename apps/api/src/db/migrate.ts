import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';

const db = drizzle(process.env.DATABASE_URL!);
await migrate(db, {
  migrationsFolder: join(import.meta.dirname, '../../drizzle'),
});
await db.$client.end();
console.log('Migrations applied');
