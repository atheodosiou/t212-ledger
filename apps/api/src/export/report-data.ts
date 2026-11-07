import { Decimal } from 'decimal.js';
import {
  computeCostBasis,
  DEFAULT_TAX_TIME_ZONE,
  taxYearOf,
  type CostMethod,
  type EngineEntry,
  type EngineWarning,
  type Holding,
  type RealisedSale,
  type YearSummary,
} from '../ledger/cost-basis.js';
import type { LedgerKind } from '../ledger/normalize.js';

/** A ledger row as the export needs it. Numeric fields are decimal strings. */
export interface ExportLedgerEntry extends EngineEntry {
  instrumentCurrency: string | null;
  price: string | null;
  fxRate: string | null;
  grossAmount: string | null;
  note: string | null;
}

export interface ExportMeta {
  accountLabel: string;
  environment: 'DEMO' | 'LIVE';
  currency: string;
  method: CostMethod;
  /** null = whole history */
  year: number | null;
  generatedAt: Date;
  timeZone: string;
  firstActivity: Date | null;
  lastActivity: Date | null;
}

export interface ReportData {
  meta: ExportMeta;
  years: YearSummary[];
  /** Sum of `years` (equals the single year when one is selected). */
  totals: Omit<YearSummary, 'year' | 'holdingsAtYearEnd'>;
  sales: RealisedSale[];
  buys: ExportLedgerEntry[];
  dividends: ExportLedgerEntry[];
  cashMovements: ExportLedgerEntry[];
  corporateActions: ExportLedgerEntry[];
  /** Holdings at the end of the selected year, or now for the whole history / the running year. */
  closingHoldings: Holding[];
  closingHoldingsTitle: string;
  entries: ExportLedgerEntry[];
  warnings: EngineWarning[];
}

const CASH_KINDS: LedgerKind[] = ['DEPOSIT', 'WITHDRAWAL', 'INTEREST', 'FEE', 'OTHER'];
const TOTAL_FIELDS = [
  'deposits',
  'withdrawals',
  'purchases',
  'saleProceeds',
  'realisedPnl',
  'dividends',
  'interest',
  'fees',
] as const;

/**
 * Builds everything an export shows. Cost basis is always computed over the
 * full history; only the presentation is narrowed to the selected year.
 */
export function buildReportData(
  allEntries: ExportLedgerEntry[],
  meta: Omit<ExportMeta, 'firstActivity' | 'lastActivity' | 'timeZone'> & { timeZone?: string },
): ReportData {
  const timeZone = meta.timeZone ?? DEFAULT_TAX_TIME_ZONE;
  const yearOf = taxYearOf(timeZone);
  const engine = computeCostBasis(allEntries, meta.method, timeZone);
  const inRange = (date: Date) => meta.year === null || yearOf(date) === meta.year;

  const entries = allEntries
    .filter((e) => inRange(e.occurredAt))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const years = engine.years.filter((y) => meta.year === null || y.year === meta.year);

  const totals = Object.fromEntries(
    TOTAL_FIELDS.map((field) => [field, sumMoney(years.map((y) => y[field]))]),
  ) as ReportData['totals'];

  return {
    meta: {
      ...meta,
      timeZone,
      firstActivity: allEntries.length ? new Date(Math.min(...allEntries.map((e) => e.occurredAt.getTime()))) : null,
      lastActivity: allEntries.length ? new Date(Math.max(...allEntries.map((e) => e.occurredAt.getTime()))) : null,
    },
    years,
    totals,
    sales: engine.sales.filter((s) => inRange(s.date)),
    buys: entries.filter((e) => e.kind === 'BUY'),
    dividends: entries.filter((e) => e.kind === 'DIVIDEND'),
    cashMovements: entries.filter((e) => CASH_KINDS.includes(e.kind)),
    corporateActions: entries.filter((e) => e.kind === 'CORPORATE_ACTION'),
    closingHoldings: meta.year === null ? engine.holdings : (years[0]?.holdingsAtYearEnd ?? []),
    closingHoldingsTitle:
      meta.year === null || meta.year >= yearOf(meta.generatedAt)
        ? `Ανοιχτές θέσεις στις ${formatDate(meta.generatedAt, timeZone)}`
        : `Ανοιχτές θέσεις στις 31/12/${meta.year}`,
    entries,
    warnings: engine.warnings.filter((w) => inRange(w.date)),
  };
}

function sumMoney(values: string[]): string {
  return values.reduce((s, v) => s.plus(v), new Decimal(0)).toFixed(2);
}

// ── Presentation helpers shared by the Excel and PDF builders ────────────────

export const KIND_LABEL: Record<LedgerKind, string> = {
  BUY: 'Αγορά',
  SELL: 'Πώληση',
  DEPOSIT: 'Κατάθεση',
  WITHDRAWAL: 'Ανάληψη',
  DIVIDEND: 'Μέρισμα',
  INTEREST: 'Τόκος',
  FEE: 'Χρέωση',
  TRANSFER: 'Εσωτερική μεταφορά',
  CORPORATE_ACTION: 'Εταιρική πράξη',
  OTHER: 'Άλλο',
};

export const METHOD_LABEL: Record<CostMethod, string> = {
  AVERAGE: 'Μέση τιμή κτήσης (όπως το Trading 212)',
  FIFO: 'FIFO (πρώτη εισαγωγή, πρώτη εξαγωγή)',
};

/** Trading 212 internal tickers look like KO_US_EQ or VWCEd_EQ; show the first part. */
export function displayTicker(ticker: string | null): string {
  return ticker ? ticker.split('_')[0] : '';
}

export function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('el-GR', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('el-GR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export const FEES_NOTE =
  'Τα ποσά αγορών περιλαμβάνουν τις χρεώσεις (π.χ. μετατροπή νομίσματος) και τα ποσά πωλήσεων είναι μετά τις χρεώσεις. ' +
  'Γι’ αυτό το αποτέλεσμα διαφέρει από το «Realised P&L» του Trading 212, που δεν τις συνυπολογίζει.';

export const DISCLAIMER =
  'Η αναφορά παράγεται αυτόματα από τα δεδομένα του Trading 212 API και δεν αποτελεί φορολογική συμβουλή. ' +
  'Η φορολογική μεταχείριση κάθε ποσού πρέπει να επιβεβαιωθεί από λογιστή.';
