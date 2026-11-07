import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Money and quantities are stored as NUMERIC and handled as strings / Decimal — never JS floats. */
const qty = (name: string) => numeric(name, { precision: 28, scale: 10 });
const money = (name: string) => numeric(name, { precision: 20, scale: 6 });

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const brokerEnvironment = pgEnum('broker_environment', ['DEMO', 'LIVE']);
export const syncStatus = pgEnum('sync_status', ['IDLE', 'QUEUED', 'RUNNING', 'FAILED']);

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('broker_accounts_user_idx').on(t.userId)],
);

export interface SyncProgress {
  orders: number;
  dividends: number;
  transactions: number;
  /** Set while the sync is waiting out a Trading 212 rate-limit window. */
  waitingUntil?: string | null;
}

export const rawSource = pgEnum('raw_source', ['ORDER', 'DIVIDEND', 'TRANSACTION']);

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
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('raw_events_identity').on(t.accountId, t.source, t.externalId)],
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
    ticker: text(),
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

export type BrokerAccount = typeof brokerAccounts.$inferSelect;
export type RawEvent = typeof rawEvents.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;

