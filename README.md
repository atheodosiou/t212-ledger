# t212-ledger

Full investment history for Trading 212 accounts, with accountant-ready exports (PDF + Excel) and a buy/sell timeline.

- `apps/api` - NestJS 12, PostgreSQL (Drizzle), background sync with pg-boss
- `apps/web` - Angular 22, Tailwind CSS 4 (added with `ng add tailwindcss`), Signal Forms, `httpResource`
- `libs/shared` - types shared by both

## How it works

1. A user connects a Trading 212 API key (read-only permissions are enough). Key and secret are stored AES-256-GCM encrypted.
2. A background job pulls `history/orders`, `history/dividends` and `history/transactions` into `raw_events`, untouched.
   Records never change once Trading 212 returns them, and pages come newest first (orders by fill time), so a
   routine sync downloads one small page per stream (10 records) and stops at the first record it already has.
   The first sync walks the whole history and saves its position after every page, so an interrupted walk resumes
   instead of starting over. Rate limits are waited out, not treated as failures.
3. `ledger_entries` is derived from `raw_events` by pure functions (`src/ledger/normalize.ts`). New records are appended; the whole ledger is rebuilt only when `LEDGER_VERSION` changes. Instrument names are checked weekly, or early (at most hourly) when an unknown ticker appears, and only changed rows are written.
4. `src/ledger/cost-basis.ts` replays the ledger (AVERAGE or FIFO) into realised P&L per sale, holdings, and per-year totals in the account currency.

## Run locally

```bash
npm install
npm run db:up                      # Postgres 18 on 127.0.0.1:5433 + daily backups into ./backups
cp apps/api/.env.example apps/api/.env   # then fill CREDENTIAL_ENCRYPTION_KEY
npm run build -w api && npm run db:migrate
npm run dev:api                    # http://localhost:3000/api
npm run build:shared
npm run dev:web                    # http://localhost:4200, proxies /api to :3000
```

## Safety

- The API listens on 127.0.0.1 only (`HOST`), and refuses to start on any other address while sign-in is the
  development stub (`DEV_USER_EMAIL`). The database port is published on 127.0.0.1 only.
- Syncs survive crashes: jobs send a heartbeat, so a sync whose process died is retried within about a minute and
  resumes where it stopped. On start-up the API also re-queues any account left marked as syncing with no job.
- Backups: the `db-backup` service writes a `pg_dump` every 24 h into `./backups` and keeps the newest 14.
  - `npm run db:backup` takes one now.
  - `npm run db:restore -- backups/<file>.dump --into=check_db` restores into a separate database to inspect it.
  - `npm run db:restore -- backups/<file>.dump --replace` replaces the live database (stop the API first).
- Keep `CREDENTIAL_ENCRYPTION_KEY` somewhere safe outside this machine (e.g. a password manager). Without it the
  stored Trading 212 keys cannot be decrypted; the history itself stays readable and keys can be entered again.
- Correctness guard: every stored Trading 212 record is checked against the fields the normalizer uses
  (`src/ledger/raw-schemas.ts`); a record of unexpected shape is kept but left out of every figure. After a sync that
  brought new records (or daily), the history is compared with Trading 212: shares per position and cash must match
  (`src/reconciliation`). The result shows in every account header; mismatches and unreadable records are listed on
  the overview.
- `GET /api/health`: 200 when the database and the job queue answer, 503 (with which one failed) otherwise. No
  sign-in, not rate limited, safe to poll.
- Logs: one line per request (method, path, status, duration); never bodies (account creation carries API keys),
  headers or query strings. `LOG_FORMAT=json` writes JSON lines.
- Rate limits: 300 requests/min overall; account creation 5/min, sync 10/min, live portfolio 30/min, exports 20/min.
- Security headers on every response (`app.useSecurityHeaders()`, Helmet 8 defaults).
- Integration tests (`npm run test:e2e`): the real app against a real Postgres, in a database of their own
  (`t212_ledger_test`, recreated each run), with a fake Trading 212. They cover first sync, nothing-new syncs,
  appends, resuming an interrupted sync, rate limits, reconciliation, paging/filters, exports and access control.
- CI (`.github/workflows/ci.yml`): typecheck, lint, tests, both builds, and `npm audit` failing on high/critical.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/accounts` | connected accounts |
| POST | `/api/accounts` | `{ label, environment: DEMO\|LIVE, apiKey, apiSecret }`, validates the key, starts a full sync |
| POST | `/api/accounts/:id/sync` | `{ full?: boolean }` |
| GET | `/api/accounts/:id/ledger` | paged: `?year=&kind=&q=&sort=&dir=&limit=&offset=` (sort: date, kind, ticker, quantity, price, fees, cash) |
| GET | `/api/accounts/:id/sales` | paged realised sales with totals for the filter: `?method=&year=&q=&sort=&dir=&limit=&offset=` |
| GET | `/api/accounts/:id/report` | `?method=AVERAGE\|FIFO`: sales, holdings, yearly totals, warnings |
| GET | `/api/accounts/:id/portfolio` | live value from Trading 212 (cached 20 s), total result since the first deposit and its breakdown, open positions |
| GET | `/api/accounts/:id/timeline` | `?method=`: monthly totals and, per instrument, every trade with the position and average cost after it |
| GET | `/api/accounts/:id/export` | `?format=xlsx\|pdf&method=AVERAGE\|FIFO&year=`: accountant report (Greek labels; tax years in Europe/Athens time) |
| DELETE | `/api/accounts/:id` | removes the account and all its data |

## Status

- Sign-in is a temporary single-user stub (`DEV_USER_EMAIL`). Real sign-in is required before any public deployment.
- Web UI: accounts list + connect form; per account three pages with a sticky header: Overview (live value, total result and breakdown, positions; collapses to a bar on scroll), For the accountant (period figures, exports, lazy-loaded sortable sales/movements tables), Timeline. Skeletons everywhere while a sync runs.
- Timeline page: monthly buys/sells chart (with table view) and a per-instrument chart of buys, sells and the average-cost step line (hand-written SVG, no chart library).
- Verified on a practice account (2026-11-07): `walletImpact.netValue` includes FX fees (BUY: cost + fee, SELL: proceeds - fee). Our realised P&L includes fees; Trading 212's own `realisedProfitLoss` and position cost exclude them, so they differ by exactly the fees.
- Verified on a real-money account (2026-11-08, 2 years, 709 trades, 24 dividends): positions match Trading 212 to 8 decimals; cost and realised P&L differ only by FX fees; cash reconciles to the cent. Real accounts use INTEREST_ON_FREE_CASH and WITHDRAW; internal tickers can be pre-merger names (NPA_US_EQ is ASTS), so display tickers come from instrument metadata (cached daily).
- Dividend tax withheld abroad is not in the API: it is estimated from the gross per share and the FX rate of the nearest trade in that currency, and labelled as an estimate.
- Not yet seen in real data: corporate actions (splits etc.).
