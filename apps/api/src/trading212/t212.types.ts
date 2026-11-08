// Response shapes of the Trading 212 public API (v0) history endpoints.
// Field conventions were confirmed against the live API in the earlier
// trading212-bot-api project:
//   - order.side is authoritative; never infer the side from the quantity sign
//   - fill.quantity is positive for BUY and negative for SELL
//   - fill.price is per share, in the instrument's currency
//   - walletImpact.fxRate is instrument units per 1 account unit (> 1 for USD in a EUR account)
//   - walletImpact.realisedProfitLoss is only present on SELL fills

export type T212Environment = 'DEMO' | 'LIVE';

export interface T212Instrument {
  ticker: string;
  name: string;
  isin: string;
  currency: string;
}

export interface T212FillTax {
  name: string;
  quantity: number;
  currency: string;
  chargedAt?: string;
}

export interface T212OrderItem {
  order: {
    id: number;
    strategy: 'VALUE' | 'QUANTITY';
    type: string;
    ticker: string;
    status: string;
    value?: number;
    filledValue?: number;
    quantity?: number;
    filledQuantity?: number;
    currency: string;
    side: 'BUY' | 'SELL';
    createdAt: string;
    initiatedFrom?: string;
    instrument: T212Instrument;
  };
  fill: {
    id: number;
    quantity: number;
    price: number;
    type: string;
    tradingMethod?: string;
    filledAt: string;
    walletImpact: {
      currency: string;
      netValue: number;
      realisedProfitLoss?: number;
      fxRate: number;
      taxes?: T212FillTax[];
    };
  } | null;
}

export interface T212Dividend {
  amount: number;
  amountInEuro?: number;
  currency?: string;
  grossAmountPerShare: number;
  instrument?: T212Instrument;
  paidOn: string;
  quantity: number;
  reference: string;
  ticker: string;
  tickerCurrency?: string;
  type: string;
}

export interface T212CashTransaction {
  amount: number;
  currency: string;
  dateTime: string;
  reference: string;
  type: string;
}

export interface T212Page<T> {
  items: T[];
  nextPagePath: string | null;
}

/** /equity/account/summary, shape confirmed on a live account (2026-11-08). */
export interface T212AccountSummary {
  id?: number;
  currency?: string;
  /** Investments plus all cash, account currency. */
  totalValue: number;
  cash?: {
    availableToTrade?: number;
    reservedForOrders?: number;
    inPies?: number;
  };
  investments?: {
    currentValue?: number;
    totalCost?: number;
    realizedProfitLoss?: number;
    unrealizedProfitLoss?: number;
  };
}

/** Item of /equity/positions. walletImpact is in the account currency. */
export interface T212Position {
  instrument: T212Instrument;
  quantity: number;
  averagePricePaid: number;
  /** Instrument currency. */
  currentPrice: number;
  createdAt?: string;
  walletImpact: {
    currency: string;
    currentValue: number;
    totalCost: number;
    unrealizedProfitLoss: number;
    fxImpact?: number;
  };
}

export class T212ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'T212ApiError';
  }
}

export class T212RateLimitError extends T212ApiError {
  constructor(readonly resetAt: Date) {
    super(
      429,
      `Trading 212 rate limit reached; resets at ${resetAt.toISOString()}`,
    );
    this.name = 'T212RateLimitError';
  }
}

/** Item of /equity/metadata/instruments. */
export interface T212InstrumentMetadata {
  ticker: string;
  /** The market ticker people know (e.g. ASTS for NPA_US_EQ). */
  shortName: string;
  name?: string;
  isin?: string;
  currencyCode?: string;
  type?: string;
}
