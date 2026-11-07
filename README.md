# t212-ledger

Full investment history for Trading 212 accounts, with accountant-ready exports (PDF + Excel) and a buy/sell timeline.

- `apps/api` - NestJS 12, PostgreSQL (Drizzle), background sync with pg-boss
- `apps/web` - Angular 22, Tailwind CSS 4 (added with `ng add tailwindcss`), Signal Forms, `httpResource`
- `libs/shared` - types shared by both

## How it works

1. A user connects a Trading 212 API key (read-only permissions are enough). Key and secret are stored AES-256-GCM encrypted.
2. A background job pulls `history/orders`, `history/dividends` and `history/transactions` into `raw_events`, untouched.
   It waits out Trading 212 rate limits instead of failing. Later syncs stop at the first page with nothing new.
3. `ledger_entries` is derived from `raw_events` by pure functions (`src/ledger/normalize.ts`) and can be rebuilt at any time.
4. `src/ledger/cost-basis.ts` replays the ledger (AVERAGE or FIFO) into realised P&L per sale, holdings, and per-year totals in the account currency.

## Run locally

```bash
npm install
npm run db:up                      # Postgres 18 on localhost:5433
cp apps/api/.env.example apps/api/.env   # then fill CREDENTIAL_ENCRYPTION_KEY
npm run build -w api && npm run db:migrate
npm run dev:api                    # http://localhost:3000/api
npm run build:shared
npm run dev:web                    # http://localhost:4200, proxies /api to :3000
```

## API

| Method | Path | |
|---|---|---|
| GET | `/api/accounts` | connected accounts |
| POST | `/api/accounts` | `{ label, environment: DEMO\|LIVE, apiKey, apiSecret }`, validates the key, starts a full sync |
| POST | `/api/accounts/:id/sync` | `{ full?: boolean }` |
| GET | `/api/accounts/:id/ledger` | `?year=&ticker=&kind=` |
| GET | `/api/accounts/:id/report` | `?method=AVERAGE\|FIFO`: sales, holdings, yearly totals, warnings |
| GET | `/api/accounts/:id/timeline` | `?method=`: monthly totals and, per instrument, every trade with the position and average cost after it |
| GET | `/api/accounts/:id/export` | `?format=xlsx\|pdf&method=AVERAGE\|FIFO&year=`: accountant report (Greek labels; tax years in Europe/Athens time) |
| DELETE | `/api/accounts/:id` | removes the account and all its data |

## Status

- Sign-in is a temporary single-user stub (`DEV_USER_EMAIL`). Real sign-in is required before any public deployment.
- Web UI: accounts list + connect form, account page (sync status, tax year, cost method, Trading 212 comparison, Excel/PDF download, sales / movements / holdings).
- Timeline page: monthly buys/sells chart (with table view) and a per-instrument chart of buys, sells and the average-cost step line (hand-written SVG, no chart library).
- Verified on a practice account (2026-11-07): `walletImpact.netValue` includes FX fees (BUY: cost + fee, SELL: proceeds - fee). Our realised P&L includes fees; Trading 212's own `realisedProfitLoss` and position cost exclude them, so they differ by exactly the fees.
- Still to verify with real data: dividend withholding, corporate actions (no such events in the practice account).
