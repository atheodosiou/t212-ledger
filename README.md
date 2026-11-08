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

Sign in at http://localhost:4200 with the `DEV_USER_EMAIL` button (development only), or with Google once
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (redirect URI
`http://localhost:4200/api/auth/oidc/google/callback`).

## Sign-in and users

- Google only (`@nestjs/authentication`: OpenID Connect with PKCE and a nonce). No passwords are stored.
- Server-side sessions in Postgres (`sessions`): an opaque token in an `HttpOnly`, `Secure`, `SameSite=Lax`
  `__Host-sid` cookie, of which only the SHA-256 is stored. 30 days at most, 7 days idle.
- Every route needs a signed-in user unless marked `@Public()` (health, the sign-in routes). Writes from another
  origin are refused (`app.enableCsrfProtection()`).
- Closed beta: an address must be invited before its first sign-in. Identities are linked by Google's subject id; an
  address Google has not verified is refused.

  ```bash
  npm run users -w api -- invite someone@example.com
  npm run users -w api -- uninvite someone@example.com
  npm run users -w api -- list
  ```

- Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID, type *Web application*:
  - Authorized redirect URIs: `https://ledger.theodosiou.me/api/auth/oidc/google/callback`, plus the localhost one
    above for development.
  - OAuth consent screen: scopes `openid`, `email`, `profile` only; privacy policy `https://ledger.theodosiou.me/privacy`.

## Personal data (GDPR)

- *Ο λογαριασμός μου* (`/settings`) lets a user:
  - download everything we hold (`GET /api/me/export`): one JSON file with the user, sign-in identities, sessions,
    accounts, the raw Trading 212 history and the ledger, never the API keys;
  - sign out everywhere;
  - delete the account (`DELETE /api/me`; the user types their address to confirm). This removes the user, accounts
    and keys, history, ledger, identities and sessions at once, and cancels queued syncs. Backups keep a copy for up
    to 14 days.
- `/privacy` says what is kept and why. Set `OPERATOR.contactEmail` in
  `apps/web/src/app/pages/privacy/privacy.page.ts` before a public launch.

## Rotating the encryption key

Stored values name the key that encrypted them (`v2.<key id>.…`), so a key can be replaced without downtime:

1. Generate a new key with `openssl rand -base64 32`, and keep it outside the server (a password manager).
2. Set `CREDENTIAL_ENCRYPTION_KEY` to the new key and `CREDENTIAL_ENCRYPTION_KEYS_OLD` to the previous one, then
   restart the API. New values use the new key; old ones still decrypt.
3. Run `npm run credentials:rotate -w api -- --dry-run`, then again without `--dry-run`. In production:
   `docker compose -f compose.prod.yml --env-file .env.production --profile tools run --rm credentials-rotate`.
   It must report `unreadable: 0`.
4. Keep the old key while backups from before step 3 exist (14 days), then remove `CREDENTIAL_ENCRYPTION_KEYS_OLD`
   and restart. If a key may have leaked, also ask users to revoke their Trading 212 keys.

## Production

```text
Browser ── https://ledger.theodosiou.me ──▶ Nginx (Contabo VPS)
                                            ├─ /      → static web app in /var/www/t212-ledger/current
                                            └─ /api/  → 127.0.0.1:3300 → API container (path unchanged)
                                                         └─ Postgres container (no published port), daily backups
```

- Files:
  - `Dockerfile`, with targets `api` and `web`;
  - `compose.prod.yml`, project `t212-ledger-prod`;
  - `deploy/nginx.conf` and `deploy/env.production.example`.
- The web app loads nothing from other sites (the fonts are self-hosted), so its CSP allows `'self'` only.
- To deploy: Actions → *CI and deployment* → Run workflow → `main`. The checks run, then the VPS runs
  `deploy/t212-deploy.sh` for that commit:
  1. builds both images;
  2. takes a `pg_dump`;
  3. migrates;
  4. switches the API container;
  5. switches the web release (an atomic symlink);
  6. checks both through Nginx.

  Any failure puts the previous API image and web release back. Migrations must stay additive (new tables and
  columns), so the previous API can run on a migrated database.
- One-time setup on the VPS, as root:
  1. A DNS `A` record for `ledger.theodosiou.me`.
  2. `git clone git@github.com:atheodosiou/t212-ledger.git /root/projects/t212-ledger`, with a read-only deploy key.
  3. `cp deploy/env.production.example .env.production`, fill it in, and `chmod 600` it.
  4. Nginx:
     - copy `deploy/nginx.conf` to `/etc/nginx/sites-available/ledger.theodosiou.me` and link it into `sites-enabled`;
     - run `nginx -t && systemctl reload nginx`;
     - run `certbot --nginx -d ledger.theodosiou.me`.
  5. Run `ssh-keygen -t ed25519 -N '' -f t212-actions` anywhere, then
     `sudo bash deploy/install.sh "$(cat t212-actions.pub)"`.
  6. GitHub → Settings → Secrets, environment `production`:
     - `VPS_HOST`;
     - `VPS_DEPLOY_KEY`: the private key;
     - `VPS_KNOWN_HOSTS`: what install.sh printed, prefixed with the host.
  7. Run the workflow, then invite yourself:
     `docker compose -f compose.prod.yml --env-file .env.production --profile tools run --rm users invite <email>`.
- After changing anything in `deploy/`, run `deploy/install.sh` on the VPS again.
- Rolling back by hand:
  - API: set `IMAGE_TAG` in `.env.production` to a previous tag, then run `docker compose … up -d api`.
  - Web: point `/var/www/t212-ledger/current` at a previous release.
  - Database: the dumps taken before each deploy are in `backups/t212_ledger-predeploy-*`.

## Safety

- The API listens on 127.0.0.1 only (`HOST`).
- The development sign-in (`DEV_USER_EMAIL`) is refused on any other address and in production.
- Production also requires Google sign-in and an https `WEB_ORIGIN`.
- The database port is published on 127.0.0.1 only in development, and not at all in production.
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
  appends, resuming an interrupted sync, rate limits, reconciliation, paging/filters, exports, access control,
  sessions, CSRF, invites, data export and erasure. They also run the auth package's contract suite against the
  session store.
- CI (`.github/workflows/ci.yml`):
  - typecheck, lint and tests;
  - both builds;
  - `npm audit`, failing on high or critical;
  - shellcheck of `deploy/`;
  - both Docker images.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/auth/config` | public: `{ google, devUser }` |
| GET | `/api/auth/oidc/google/login` | public: `?redirectTo=/path`, redirects to Google |
| GET | `/api/auth/me` | the signed-in user (401 otherwise) |
| POST | `/api/auth/logout`, `/api/auth/logout-everywhere` | |
| GET | `/api/me/export` | all of the user's data, as a JSON download |
| DELETE | `/api/me` | `{ confirmEmail }`: deletes the user and everything they own |
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

- Sign-in with Google, invite-only (closed beta). Not yet tried with a real Google client, and not yet deployed.
- Web UI: accounts list + connect form; per account three pages with a sticky header: Overview (live value, total result and breakdown, positions; collapses to a bar on scroll), For the accountant (period figures, exports, lazy-loaded sortable sales/movements tables), Timeline. Skeletons everywhere while a sync runs.
- Timeline page: monthly buys/sells chart (with table view) and a per-instrument chart of buys, sells and the average-cost step line (hand-written SVG, no chart library).
- Verified on a practice account (2026-11-07): `walletImpact.netValue` includes FX fees (BUY: cost + fee, SELL: proceeds - fee). Our realised P&L includes fees; Trading 212's own `realisedProfitLoss` and position cost exclude them, so they differ by exactly the fees.
- Verified on a real-money account (2026-11-08, 2 years, 709 trades, 24 dividends): positions match Trading 212 to 8 decimals; cost and realised P&L differ only by FX fees; cash reconciles to the cent. Real accounts use INTEREST_ON_FREE_CASH and WITHDRAW; internal tickers can be pre-merger names (NPA_US_EQ is ASTS), so display tickers come from instrument metadata (cached daily).
- Dividend tax withheld abroad is not in the API: it is estimated from the gross per share and the FX rate of the nearest trade in that currency, and labelled as an estimate.
- Not yet seen in real data: corporate actions (splits etc.).
