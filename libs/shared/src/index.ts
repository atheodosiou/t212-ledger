// Types shared by the API and the web app. API response DTOs move here as the UI is built.
export type BrokerEnvironment = 'DEMO' | 'LIVE';
export type CostMethod = 'AVERAGE' | 'FIFO';
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
