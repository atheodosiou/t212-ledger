// Restores a backup made by the db-backup service.
//
//   npm run db:restore -- backups/<file>.dump --into=check_db   restore into a separate database, to inspect it
//   npm run db:restore -- backups/<file>.dump --replace         replace t212_ledger itself (stop the API first)
//
// Replacing the live database must be asked for explicitly; there is no default target.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const LIVE_DB = 't212_ledger';
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const into = args.find((a) => a.startsWith('--into='))?.slice('--into='.length);
const replace = args.includes('--replace');

const fail = (message) => {
  console.error(message);
  console.error('Usage: npm run db:restore -- backups/<file>.dump (--into=<database> | --replace)');
  process.exit(1);
};

if (!file || !existsSync(file)) fail('Backup file not found.');
if (!resolve(file).startsWith(resolve('backups'))) fail('The backup must be inside ./backups (mounted into the container).');
if (replace === Boolean(into)) fail('Choose exactly one: --into=<database> or --replace.');
if (into && (!/^[a-z_][a-z0-9_]*$/.test(into) || into === LIVE_DB)) {
  fail(`--into must be a plain database name other than ${LIVE_DB}; use --replace to overwrite it.`);
}

const target = replace ? LIVE_DB : into;
const compose = (...rest) => execFileSync('docker', ['compose', ...rest], { stdio: 'inherit' });

if (!replace) {
  compose('exec', '-T', 'db', 'psql', '-U', 't212', '-d', 'postgres', '-qc', `drop database if exists ${target}`);
  compose('exec', '-T', 'db', 'psql', '-U', 't212', '-d', 'postgres', '-qc', `create database ${target}`);
}
compose(
  'run', '--rm', '-T', '--entrypoint', 'pg_restore', 'db-backup',
  '--clean', '--if-exists', '--no-owner', `--dbname=${target}`, `/backups/${basename(file)}`,
);
console.log(`Restored ${basename(file)} into ${target}`);
