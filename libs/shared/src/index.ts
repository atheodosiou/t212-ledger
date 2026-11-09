// Types shared by the API and the web app. Dates travel as ISO strings and
// money/quantities as decimal strings, exactly as the API serializes them.

export type BrokerEnvironment = "DEMO" | "LIVE";
export type CostMethod = "AVERAGE" | "FIFO";
export type SyncStatus = "IDLE" | "QUEUED" | "RUNNING" | "FAILED";
export type ExportFormat = "xlsx" | "pdf";
export type LedgerKind =
  | "BUY"
  | "SELL"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "DIVIDEND"
  | "INTEREST"
  | "FEE"
  | "TRANSFER"
  | "CORPORATE_ACTION"
  | "OTHER";

export type SyncStage =
  "ORDERS" | "DIVIDENDS" | "TRANSACTIONS" | "INSTRUMENTS" | "LEDGER" | "CHECK";

export interface ReconciliationDto {
  checkedAt: string;
  ok: boolean;
  issues: {
    kind: "position" | "cash" | "unreadable" | "unmapped" | "history";
    severity: "error" | "warning";
    message: string;
  }[];
  compared: { positions: number; cashLedger: string; cashBroker: string };
  stale?: boolean;
}

export interface SyncProgressDto {
  orders: number;
  dividends: number;
  transactions: number;
  stage?: SyncStage | null;
  waitingUntil?: string | null;
}

export interface AccountDto {
  id: string;
  userId: string;
  label: string;
  environment: BrokerEnvironment;
  accountCurrency: string;
  syncStatus: SyncStatus;
  syncProgress: SyncProgressDto | null;
  syncError: string | null;
  lastSyncedAt: string | null;
  reconciliation: ReconciliationDto | null;
  exportState: ExportStateDto | null;
  exportCheck: ExportCheckDto | null;
  createdAt: string;
}

/** Which years of Trading 212's CSV export the app holds, and whether it can fetch them. */
export interface ExportStateDto {
  years: Record<string, { coveredTo: string; fetchedAt: string; rows: number }>;
  running?: { year: number; reportId: number | null; since: string } | null;
  blocked?: {
    reason: "demo" | "permission" | "error";
    message: string;
    at: string;
  } | null;
}

export interface ExportDifferenceDto {
  kind: "missing-from-api" | "missing-from-export" | "mismatch";
  date: string;
  what: string;
  detail: string;
}

/** Line-by-line comparison of the API history with Trading 212's CSV export. */
export interface ExportCheckDto {
  checkedAt: string;
  from: string;
  to: string;
  ok: boolean;
  compared: { orders: number; dividends: number; cash: number };
  differences: ExportDifferenceDto[];
  truncated: number;
}

export interface CreateAccountRequest {
  label: string;
  environment: BrokerEnvironment;
  apiKey: string;
  apiSecret: string;
}

export interface LedgerEntryDto {
  id: string;
  occurredAt: string;
  kind: LedgerKind;
  sourceType: string;
  ticker: string | null;
  /** Market ticker (e.g. ASTS); Trading 212 internal tickers can be pre-merger names. */
  displayTicker: string | null;
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

export interface RealisedSaleDto {
  entryId: string;
  date: string;
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  quantity: string;
  proceeds: string;
  costBasis: string;
  realisedPnl: string;
  sellFees: string;
  brokerRealisedPnl: string | null;
  unmatchedQuantity: string;
}

export interface HoldingDto {
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  quantity: string;
  costBasis: string;
  averageCost: string;
}

export interface YearSummaryDto {
  year: number;
  /** Credited, as Trading 212 reports it (after deposit fees). */
  deposits: string;
  depositFees: string;
  withdrawals: string;
  purchases: string;
  saleProceeds: string;
  realisedPnl: string;
  /** Trading 212's own result of the sales (FX fees not deducted). */
  brokerRealisedPnl: string;
  dividends: string;
  interest: string;
  fees: string;
  holdingsAtYearEnd: HoldingDto[];
}

export interface PositionEventDto {
  entryId: string;
  date: string;
  kind: "BUY" | "SELL" | "CORPORATE_ACTION";
  sourceType: string;
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  quantity: string;
  pricePerShare: string | null;
  positionQuantity: string;
  averageCost: string | null;
  realisedPnl: string | null;
}

export interface MonthBucketDto {
  month: string;
  deposits: string;
  withdrawals: string;
  purchases: string;
  saleProceeds: string;
  realisedPnl: string;
  dividends: string;
  interest: string;
  fees: string;
  buys: number;
  sells: number;
  cumulativeNetDeposits: string;
}

export interface InstrumentTimelineDto {
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  trades: number;
  currentQuantity: string;
  events: PositionEventDto[];
}

export interface TimelineDto {
  method: CostMethod;
  months: MonthBucketDto[];
  instruments: InstrumentTimelineDto[];
  journey: JourneyDto;
}

export interface JourneySeriesDto {
  key: string;
  ticker: string;
  instrumentName: string | null;
}

export interface JourneyMonthDto {
  month: string;
  /** Cost of the shares held at the end of the month. */
  invested: string;
  /** Per series; the last is everything else. */
  values: string[];
  positions: number;
}

export type MilestoneKind =
  "FIRST_DEPOSIT" | "NEW_POSITION" | "CLOSED" | "FIRST_DIVIDEND" | "WITHDRAWAL";

export interface MilestoneDto {
  kind: MilestoneKind;
  date: string;
  ticker: string | null;
  isin: string | null;
  instrumentName: string | null;
  amount: string | null;
  realisedPnl: string | null;
  again: boolean;
}

export interface JourneyDto {
  series: JourneySeriesDto[];
  months: JourneyMonthDto[];
  milestones: MilestoneDto[];
}

export interface DividendDetailDto {
  entryId: string;
  date: string;
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  shares: string | null;
  grossInstrument: string | null;
  instrumentCurrency: string | null;
  net: string;
  fxRate: string | null;
  grossAccount: string | null;
  /** Negative for a refund of withheld tax. */
  withheld: string | null;
  /** As Trading 212 states it, in its currency (from its export). */
  withheldOriginal: string | null;
  withheldCurrency: string | null;
  withholdingRate: string | null;
  source: "export" | "api" | "estimate" | "adjustment";
  estimated: boolean;
  note: string | null;
}

export interface ReportDto {
  method: CostMethod;
  sales: RealisedSaleDto[];
  holdings: HoldingDto[];
  years: YearSummaryDto[];
  warnings: { entryId: string; date: string; message: string }[];
  dividends: DividendDetailDto[];
}

export interface LivePositionDto {
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  quantity: string;
  currentPrice: string;
  instrumentCurrency: string | null;
  value: string;
  cost: string;
  result: string;
  resultPct: string | null;
  weightPct: string;
  fxImpact: string | null;
}

export type BreakdownKey =
  "realised" | "unrealised" | "dividends" | "interest" | "fees" | "other";

export interface PortfolioDto {
  asOf: string;
  currency: string;
  totalValue: string;
  investedValue: string;
  cash: string;
  netDeposits: string;
  totalResult: string;
  totalResultPct: string | null;
  breakdown: { key: BreakdownKey; amount: string }[];
  breakdownTotal: string;
  unexplained: string;
  positions: LivePositionDto[];
  /** True when Trading 212 rate-limited us and this is the last good snapshot. */
  stale: boolean;
}

export type SortDir = "asc" | "desc";
export type LedgerSort =
  "date" | "kind" | "ticker" | "quantity" | "price" | "fees" | "cash";
export type SaleSort =
  | "date"
  | "ticker"
  | "quantity"
  | "proceeds"
  | "costBasis"
  | "realisedPnl"
  | "brokerRealisedPnl";

export interface PageDto<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
}

export interface SalesPageDto extends PageDto<RealisedSaleDto> {
  totals: {
    proceeds: string;
    costBasis: string;
    realisedPnl: string;
    brokerRealisedPnl: string;
    fees: string;
  };
}

/** The signed-in user. */
export interface UserDto {
  id: string;
  email: string;
  name: string | null;
}

/** Sign-in methods the server offers. */
export interface AuthConfigDto {
  google: boolean;
}

/** Greek tax treatment of an instrument. */
export type TaxClass =
  "SHARE" | "SHARE_QUALIFYING" | "UCITS" | "FUND_NON_EU" | "ETC";
export type InterestTreatment = "INTEREST" | "EXEMPT";

export interface TaxInstrumentDto {
  isin: string;
  ticker: string;
  name: string | null;
  type: string | null;
  suggested: TaxClass;
  taxClass: TaxClass;
  confirmed: boolean;
}

export interface TaxSettingsDto {
  interest: InterestTreatment;
  priorLosses: { year: number; amount: string }[];
}

export interface TaxSaleLineDto {
  entryId: string;
  date: string;
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  taxClass: TaxClass;
  quantity: string;
  proceeds: string;
  costBasis: string;
  realisedPnl: string;
  taxable: boolean;
}

export interface TaxDividendLineDto {
  entryId: string;
  date: string;
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  taxClass: TaxClass;
  gross: string | null;
  withheld: string | null;
  withholdingRate: string | null;
  greekTax: string;
  credit: string;
  due: string;
  exempt: boolean;
  adjustment: boolean;
  estimated: boolean;
  note: string | null;
}

export interface LossPoolEntryDto {
  originYear: number;
  amount: string;
  used: string;
  remaining: string;
  usableUntil: number;
  prior: boolean;
}

export interface TaxOverviewDto {
  year: number;
  years: number[];
  supported: boolean;
  rates: { dividend: string; interest: string; gains: string };
  accounts: { id: string; label: string }[];
  excluded: { id: string; label: string; reason: string }[];
  e1CodesYear: number;
  unconfirmed: number;
  warnings: string[];
  dividends: {
    lines: TaxDividendLineDto[];
    gross: string;
    withheld: string;
    adjustments: string;
    greekTax: string;
    credit: string;
    due: string;
    exemptGross: string;
    estimated: number;
  };
  interest: {
    gross: string;
    count: number;
    treatment: InterestTreatment;
    tax: string;
  };
  gains: {
    lines: TaxSaleLineDto[];
    exemptGains: string;
    exemptLosses: string;
    taxableGains: string;
    taxableLosses: string;
    taxableNet: string;
    lossesUsed: string;
    taxableAfterLosses: string;
    tax: string;
    unmatched: number;
  };
  losses: { pool: LossPoolEntryDto[]; available: string; expiring: string };
  justification: { purchases: string; capitalReturned: string };
  e1: { code: string; label: string; amount: string }[];
  totalDue: string;
}

export interface HoldingCycleDto {
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  opened: string;
  closed: string;
  days: number;
  invested: string;
  realisedPnl: string;
  returnPct: string;
}

export type HoldingBucketKey = "DAY" | "WEEK" | "MONTH" | "YEAR" | "LONGER";

export interface CostYearDto {
  year: number;
  currencyConversion: string;
  transactionTaxes: string;
  depositFees: string;
  otherFees: string;
  dividendTaxLost: string;
  total: string;
  purchases: string;
  realisedPnl: string;
}

export interface ExposureDto {
  key: string;
  invested: string;
  share: string;
}

export interface InsightsDto {
  holding: {
    cycles: HoldingCycleDto[];
    buckets: {
      key: HoldingBucketKey;
      positions: number;
      wins: number;
      realisedPnl: string;
    }[];
  };
  results: {
    instruments: {
      ticker: string;
      isin: string | null;
      instrumentName: string | null;
      realisedPnl: string;
      sales: number;
      open: boolean;
    }[];
    closedPositions: number;
    wins: number;
    winRate: string | null;
    averageWin: string | null;
    averageLoss: string | null;
    profitFactor: string | null;
  };
  costs: { years: CostYearDto[]; total: CostYearDto };
  exposure: {
    currencies: ExposureDto[];
    countries: ExposureDto[];
    currencyMonths: JourneyMonthDto[];
    currencySeries: string[];
  };
}
