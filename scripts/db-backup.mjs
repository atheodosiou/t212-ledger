// Takes a backup now, next to the daily ones. Usage: npm run db:backup
import { execFileSync } from 'node:child_process';

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const file = `/backups/t212_ledger-manual-${stamp}.dump`;
execFileSync(
  'docker',
  ['compose', 'run', '--rm', '-T', '--entrypoint', 'pg_dump', 'db-backup', '--format=custom', `--file=${file}`],
  { stdio: 'inherit' },
);
console.log(`Backup written: backups/${file.split('/').pop()}`);
