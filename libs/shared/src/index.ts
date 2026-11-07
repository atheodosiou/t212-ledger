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

export interface SyncProgressDto {
  orders: number;
  dividends: number;
  transactions: number;
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

export interface ReportDto {
  method: CostMethod;
  sales: RealisedSaleDto[];
  holdings: HoldingDto[];
  years: YearSummaryDto[];
  warnings: { entryId: string; date: string; message: string }[];
}
