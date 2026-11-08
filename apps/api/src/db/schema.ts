import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Reconciliation } from '../reconciliation/reconcile.js';

/** Money and quantities are stored as NUMERIC and handled as strings / Decimal — never JS floats. */
const qty = (name: string) => numeric(name, { precision: 28, scale: 10 });
const money = (name: string) => numeric(name, { precision: 20, scale: 6 });

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  /** Lower-cased. Verified by the sign-in provider. */
  email: text().notNull().unique(),
  name: text(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
});

/** Sign-in identities, linked by (provider, subject): never by email alone. */
export const userIdentities = pgTable(
  'user_identities',
  {
    provider: text().notNull(),
    subject: text().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.subject] }),
    index('user_identities_user_idx').on(t.userId),
  ],
);

/** Closed beta: only these addresses can create an account. Managed with `npm run users`. */
export const invites = pgTable('invites', {
  /** Lower-cased. */
  email: text().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
});

/**
 * Signed-in browsers. The id is the SHA-256 of the cookie token, never the token.
 * No foreign key on user_id: the session store must accept any user id (its contract
 * tests use made-up ones); a session whose user is gone signs no one in, and
 * deleting a user deletes their sessions explicitly.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastActiveAt: timestamp('last_active_at', {
      withTimezone: true,
    }).notNull(),
    mfa: text().$type<'pending' | 'verified'>(),
    metadata: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

/** Sign-ins in progress, between the redirect to Google and the callback (PKCE verifier, nonce). */
export const oidcLogins = pgTable(
  'oidc_logins',
  {
    /** SHA-256 of the secret in the browser's transaction cookie. */
    state: text().primaryKey(),
    provider: text().notNull(),
    codeVerifier: text('code_verifier').notNull(),
    nonce: text(),
    redirectTo: text('redirect_to'),
    linkUserId: text('link_user_id'),
    linkSessionId: text('link_session_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('oidc_logins_expires_idx').on(t.expiresAt)],
);

export const brokerEnvironment = pgEnum('broker_environment', ['DEMO', 'LIVE']);
export const syncStatus = pgEnum('sync_status', [
  'IDLE',
  'QUEUED',
  'RUNNING',
  'FAILED',
]);

export const brokerAccounts = pgTable(
  'broker_accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text().notNull(),
    environment: brokerEnvironment().notNull(),
    /** AES-256-GCM ciphertext; never returned by the API. */
    apiKeyEnc: text('api_key_enc').notNull(),
    apiSecretEnc: text('api_secret_enc').notNull(),
    accountCurrency: text('account_currency').notNull().default('EUR'),
    syncStatus: syncStatus('sync_status').notNull().default('IDLE'),
    syncProgress: jsonb('sync_progress').$type<SyncProgress>(),
    syncError: text('sync_error'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    /** Where each history stream's first full walk has got to; lets an interrupted walk resume. */
    syncState: jsonb('sync_state').$type<SyncStreamsState>(),
    /** Normalizer version the ledger was built with; a mismatch triggers one full rebuild. */
    ledgerVersion: integer('ledger_version'),
    /** Last comparison of the replayed history with Trading 212 (see reconciliation/reconcile.ts). */
    reconciliation: jsonb('reconciliation').$type<Reconciliation>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('broker_accounts_user_idx').on(t.userId)],
);

export interface StreamSyncState {
  /** True once every page of history has been stored at least once. */
  backfillDone: boolean;
  /** Next page of the first full walk to fetch, when it was interrupted. */
  resume: string | null;
}

export type SyncStreamsState = Partial<
  Record<'ORDER' | 'DIVIDEND' | 'TRANSACTION', StreamSyncState>
>;

/** Small key/value store for app-wide bookkeeping (e.g. when instrument names were last checked). */
export const appState = pgTable('app_state', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Steps of a sync, in order. */
export type SyncStage =
  'ORDERS' | 'DIVIDENDS' | 'TRANSACTIONS' | 'INSTRUMENTS' | 'LEDGER' | 'CHECK';

export interface SyncProgress {
  orders: number;
  dividends: number;
  transactions: number;
  /** The step currently running. */
  stage?: SyncStage | null;
  /** Set while the sync is waiting out a Trading 212 rate-limit window. */
  waitingUntil?: string | null;
}

export const rawSource = pgEnum('raw_source', [
  'ORDER',
  'DIVIDEND',
  'TRANSACTION',
]);

/** Immutable copy of every item returned by the Trading 212 history endpoints. */
export const rawEvents = pgTable(
  'raw_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => brokerAccounts.id, { onDelete: 'cascade' }),
    source: rawSource().notNull(),
    externalId: text('external_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    payload: jsonb().notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('raw_events_identity').on(t.accountId, t.source, t.externalId),
  ],
);

export const ledgerKind = pgEnum('ledger_kind', [
  'BUY',
  'SELL',
  'DEPOSIT',
  'WITHDRAWAL',
  'DIVIDEND',
  'INTEREST',
  'FEE',
  'TRANSFER',
  'CORPORATE_ACTION',
  'OTHER',
]);

/** Normalized, derived view of raw_events. Fully rebuildable. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => brokerAccounts.id, { onDelete: 'cascade' }),
    rawEventId: uuid('raw_event_id')
      .notNull()
      .references(() => rawEvents.id, { onDelete: 'cascade' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    kind: ledgerKind().notNull(),
    /** Original Trading 212 type (e.g. TRADE, STOCK_SPLIT, DEPOSIT, INTEREST) for audit. */
    sourceType: text('source_type').notNull(),
    /** Trading 212 internal ticker, e.g. NPA_US_EQ. Can be a pre-merger name. */
    ticker: text(),
    /** Market ticker people know, e.g. ASTS, from instrument metadata. */
    displayTicker: text('display_ticker'),
    isin: text(),
    instrumentName: text('instrument_name'),
    instrumentCurrency: text('instrument_currency'),
    /** Signed share delta: + for BUY, - for SELL. */
    quantity: qty('quantity'),
    /** Per-share price in instrument currency. */
    price: qty('price'),
    /** Trading 212 fx rate at execution (instrument units per 1 account unit). */
    fxRate: qty('fx_rate'),
    /** Signed cash impact on the account, in account currency, fees included. */
    cashAmount: money('cash_amount').notNull(),
    /** Fees in account currency (positive number). Included in cashAmount. */
    fees: money('fees').notNull().default('0'),
    /** Gross dividend in instrument currency, when known. */
    grossAmount: money('gross_amount'),
    /** Trading 212's own realised P&L on SELL fills (average-cost), for reconciliation. */
    brokerRealisedPnl: money('broker_realised_pnl'),
    note: text(),
  },
  (t) => [
    uniqueIndex('ledger_entries_raw_idx').on(t.rawEventId),
    index('ledger_entries_account_time_idx').on(t.accountId, t.occurredAt),
    index('ledger_entries_account_ticker_idx').on(t.accountId, t.ticker),
  ],
);

/**
 * Trading 212 instrument metadata, shared by all accounts. Refreshed at most once a
 * day because the endpoint allows one call per 50 seconds and returns ~17k rows.
 */
export const instruments = pgTable('instruments', {
  ticker: text().primaryKey(),
  shortName: text('short_name').notNull(),
  name: text(),
  isin: text(),
  currency: text(),
  type: text(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type BrokerAccount = typeof brokerAccounts.$inferSelect;
export type RawEvent = typeof rawEvents.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
