import { Decimal } from 'decimal.js';
import type { T212CashTransaction, T212Dividend, T212OrderItem } from '../trading212/t212.types.js';

export type RawSource = 'ORDER' | 'DIVIDEND' | 'TRANSACTION';
export type LedgerKind =
  | 'BUY'
  | 'SELL'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'DIVIDEND'
  | 'INTEREST'
  | 'FEE'
  | 'TRANSFER'
  | 'CORPORATE_ACTION'
  | 'OTHER';

/** Normalized entry. Numeric fields are decimal strings. */
export interface NormalizedEntry {
  occurredAt: Date;
  kind: LedgerKind;
  sourceType: string;
  ticker: string | null;
  isin: string | null;
  instrumentName: string | null;
  instrumentCurrency: string | null;
  quantity: string | null;
  price: string | null;
  fxRate: string | null;
  cashAmount: string;
  fees: string;
  grossAmount: string | null;
  brokerRealisedPnl: string | null;
  note: string | null;
}

export interface RawIdentity {
  externalId: string;
  occurredAt: Date;
}

const d = (v: number | string) => new Decimal(v);
const str = (v: Decimal) => v.toFixed();

// ── Identity (used for idempotent upserts of raw events) ─────────────────────

export function orderIdentity(item: T212OrderItem): RawIdentity {
  return {
    externalId: `${item.order.id}:${item.fill?.id ?? 'nofill'}`,
    occurredAt: new Date(item.fill?.filledAt ?? item.order.createdAt),
  };
}

export function dividendIdentity(item: T212Dividend): RawIdentity {
  return { externalId: item.reference, occurredAt: new Date(item.paidOn) };
}

export function transactionIdentity(item: T212CashTransaction): RawIdentity {
  return { externalId: item.reference, occurredAt: new Date(item.dateTime) };
}

// ── Normalization ────────────────────────────────────────────────────────────

/** Returns null for items that never touched the account (cancelled/rejected orders). */
export function normalizeOrder(item: T212OrderItem): NormalizedEntry | null {
  const { order, fill } = item;
  if (!fill) return null;

  const fees = (fill.walletImpact.taxes ?? []).reduce((sum, t) => sum.plus(d(t.quantity).abs()), d(0));
  const shares = d(fill.quantity).abs();
  const isTrade = fill.type === 'TRADE';
  const isBuy = order.side === 'BUY';
  const net = d(fill.walletImpact.netValue).abs();

  const base = {
    occurredAt: new Date(fill.filledAt),
    sourceType: fill.type,
    ticker: order.instrument?.ticker ?? order.ticker,
    isin: order.instrument?.isin ?? null,
    instrumentName: order.instrument?.name ?? null,
    instrumentCurrency: order.instrument?.currency ?? null,
    price: str(d(fill.price)),
    fxRate: fill.walletImpact.fxRate ? str(d(fill.walletImpact.fxRate)) : null,
    grossAmount: null,
    note: null,
  };

  if (!isTrade) {
    // Splits, stock dividends, spin-offs, etc.: share delta without a cash trade.
    return {
      ...base,
      kind: 'CORPORATE_ACTION',
      quantity: str(d(fill.quantity)),
      cashAmount: '0',
      fees: str(fees),
      brokerRealisedPnl: null,
      note: `Corporate action ${fill.type}; review cost basis`,
    };
  }

  return {
    ...base,
    kind: isBuy ? 'BUY' : 'SELL',
    quantity: str(isBuy ? shares : shares.neg()),
    // netValue is the account-currency amount that left (BUY) or entered (SELL) the account.
    cashAmount: str(isBuy ? net.neg() : net),
    fees: str(fees),
    brokerRealisedPnl:
      fill.walletImpact.realisedProfitLoss != null ? str(d(fill.walletImpact.realisedProfitLoss)) : null,
  };
}

export function normalizeDividend(item: T212Dividend): NormalizedEntry {
  return {
    occurredAt: new Date(item.paidOn),
    kind: 'DIVIDEND',
    sourceType: item.type,
    ticker: item.instrument?.ticker ?? item.ticker,
    isin: item.instrument?.isin ?? null,
    instrumentName: item.instrument?.name ?? null,
    instrumentCurrency: item.tickerCurrency ?? item.instrument?.currency ?? null,
    quantity: str(d(item.quantity)),
    price: null,
    fxRate: null,
    cashAmount: str(d(item.amount)),
    fees: '0',
    grossAmount: str(d(item.grossAmountPerShare).times(item.quantity)),
    brokerRealisedPnl: null,
    note: null,
  };
}

// Practice and real-money accounts use different names for the same thing
// (e.g. INTEREST vs INTEREST_ON_FREE_CASH, WITHDRAWAL vs WITHDRAW).
const TRANSACTION_KIND: Record<string, LedgerKind> = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  WITHDRAW: 'WITHDRAWAL',
  FEE: 'FEE',
  INTEREST: 'INTEREST',
  INTEREST_ON_FREE_CASH: 'INTEREST',
  TRANSFER_TO_PIE: 'TRANSFER',
  TRANSFER_FROM_PIE: 'TRANSFER',
  TRANSFER_TO_SAVINGS: 'TRANSFER',
  TRANSFER_FROM_SAVINGS: 'TRANSFER',
};

export function transactionKind(type: string): LedgerKind {
  const known = TRANSACTION_KIND[type];
  if (known) return known;
  // Unseen variants: classify by family, and keep the original type in sourceType for audit.
  if (type.startsWith('TRANSFER')) return 'TRANSFER';
  if (type.includes('INTEREST')) return 'INTEREST';
  if (type.startsWith('WITHDRAW')) return 'WITHDRAWAL';
  if (type.startsWith('DEPOSIT')) return 'DEPOSIT';
  if (type.endsWith('FEE')) return 'FEE';
  return 'OTHER';
}

export function normalizeTransaction(item: T212CashTransaction): NormalizedEntry {
  const kind = transactionKind(item.type);
  const amount = d(item.amount);
  return {
    occurredAt: new Date(item.dateTime),
    kind,
    sourceType: item.type,
    ticker: null,
    isin: null,
    instrumentName: null,
    instrumentCurrency: null,
    quantity: null,
    price: null,
    fxRate: null,
    cashAmount: str(amount),
    fees: kind === 'FEE' ? str(amount.abs()) : '0',
    grossAmount: null,
    brokerRealisedPnl: null,
    note: kind === 'OTHER' ? `Unmapped transaction type ${item.type}` : null,
  };
}

export function normalizeRaw(source: RawSource, payload: unknown): NormalizedEntry | null {
  switch (source) {
    case 'ORDER':
      return normalizeOrder(payload as T212OrderItem);
    case 'DIVIDEND':
      return normalizeDividend(payload as T212Dividend);
    case 'TRANSACTION':
      return normalizeTransaction(payload as T212CashTransaction);
  }
}
