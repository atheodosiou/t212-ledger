// Types shared by the API and the web app. Dates travel as ISO strings and
// money/quantities as decimal strings, exactly as the API serializes them.

export type BrokerEnvironment = 'DEMO' | 'LIVE';
export type CostMethod = 'AVERAGE' | 'FIFO';
export type SyncStatus = 'IDLE' | 'QUEUED' | 'RUNNING' | 'FAILED';
export type ExportFormat = 'xlsx' | 'pdf';
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

export type SyncStage = 'ORDERS' | 'DIVIDENDS' | 'TRANSACTIONS' | 'INSTRUMENTS' | 'LEDGER';

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
  createdAt: string;
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
  deposits: string;
  withdrawals: string;
  purchases: string;
  saleProceeds: string;
  realisedPnl: string;
  dividends: string;
  interest: string;
  fees: string;
  holdingsAtYearEnd: HoldingDto[];
}

export interface PositionEventDto {
  entryId: string;
  date: string;
  kind: 'BUY' | 'SELL' | 'CORPORATE_ACTION';
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
  withheld: string | null;
  withholdingRate: string | null;
  estimated: boolean;
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

export type BreakdownKey = 'realised' | 'unrealised' | 'dividends' | 'interest' | 'fees' | 'other';

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

export type SortDir = 'asc' | 'desc';
export type LedgerSort = 'date' | 'kind' | 'ticker' | 'quantity' | 'price' | 'fees' | 'cash';
export type SaleSort = 'date' | 'ticker' | 'quantity' | 'proceeds' | 'costBasis' | 'realisedPnl' | 'brokerRealisedPnl';

export interface PageDto<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
}

export interface SalesPageDto extends PageDto<RealisedSaleDto> {
  totals: { proceeds: string; costBasis: string; realisedPnl: string; brokerRealisedPnl: string; fees: string };
}
