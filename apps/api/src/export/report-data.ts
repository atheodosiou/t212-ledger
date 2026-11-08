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
import {
  dividendDetails,
  type DividendDetail,
  type DividendExportRow,
} from '../ledger/dividends.js';
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
  dividends: DividendDetail[];
  /** Gross dividends and tax withheld abroad, per year shown. */
  dividendTax: Map<number, DividendTaxYear>;
  cashMovements: ExportLedgerEntry[];
  corporateActions: ExportLedgerEntry[];
  /** Holdings at the end of the selected year, or now for the whole history / the running year. */
  closingHoldings: Holding[];
  closingHoldingsTitle: string;
  entries: ExportLedgerEntry[];
  warnings: EngineWarning[];
}

export interface DividendTaxYear {
  gross: string;
  withheld: string;
  /** Some dividends could not be converted, so the totals understate the tax. */
  partial: boolean;
  /** Some figures are estimates (no export row for them). */
  estimated: boolean;
}

const CASH_KINDS: LedgerKind[] = [
  'DEPOSIT',
  'WITHDRAWAL',
  'INTEREST',
  'FEE',
  'OTHER',
];
const TOTAL_FIELDS = [
  'deposits',
  'depositFees',
  'withdrawals',
  'purchases',
  'saleProceeds',
  'realisedPnl',
  'brokerRealisedPnl',
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
  meta: Omit<ExportMeta, 'firstActivity' | 'lastActivity' | 'timeZone'> & {
    timeZone?: string;
    /** Dividend rows of Trading 212's CSV export: the exact tax withheld. */
    dividendExportRows?: DividendExportRow[];
  },
): ReportData {
  const timeZone = meta.timeZone ?? DEFAULT_TAX_TIME_ZONE;
  const yearOf = taxYearOf(timeZone);
  const engine = computeCostBasis(allEntries, meta.method, timeZone);
  const inRange = (date: Date) =>
    meta.year === null || yearOf(date) === meta.year;

  const entries = allEntries
    .filter((e) => inRange(e.occurredAt))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const years = engine.years.filter(
    (y) => meta.year === null || y.year === meta.year,
  );

  const totals = Object.fromEntries(
    TOTAL_FIELDS.map((field) => [field, sumMoney(years.map((y) => y[field]))]),
  ) as ReportData['totals'];

  const dividends = dividendDetails(
    allEntries,
    meta.currency,
    meta.dividendExportRows ?? [],
  ).filter((d) => inRange(d.date));
  const dividendTax = new Map<number, DividendTaxYear>();
  for (const y of years) {
    const inYear = dividends.filter((d) => yearOf(d.date) === y.year);
    dividendTax.set(y.year, {
      gross: sumMoney(inYear.map((d) => d.grossAccount ?? d.net)),
      withheld: sumMoney(inYear.map((d) => d.withheld ?? '0')),
      partial: inYear.some((d) => d.withheld === null),
      estimated: inYear.some((d) => d.source === 'estimate'),
    });
  }

  const { dividendExportRows: _rows, ...shownMeta } = meta;
  return {
    meta: {
      ...shownMeta,
      timeZone,
      firstActivity: allEntries.length
        ? new Date(Math.min(...allEntries.map((e) => e.occurredAt.getTime())))
        : null,
      lastActivity: allEntries.length
        ? new Date(Math.max(...allEntries.map((e) => e.occurredAt.getTime())))
        : null,
    },
    years,
    totals,
    sales: engine.sales.filter((s) => inRange(s.date)),
    buys: entries.filter((e) => e.kind === 'BUY'),
    dividends,
    dividendTax,
    cashMovements: entries.filter((e) => CASH_KINDS.includes(e.kind)),
    corporateActions: entries.filter((e) => e.kind === 'CORPORATE_ACTION'),
    closingHoldings:
      meta.year === null
        ? engine.holdings
        : (years[0]?.holdingsAtYearEnd ?? []),
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
  return new Intl.DateTimeFormat('el-GR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
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
  'Τα ποσά αγορών περιλαμβάνουν τις χρεώσεις μετατροπής νομίσματος και τα ποσά πωλήσεων είναι μετά από αυτές, οπότε το «Αποτέλεσμα πωλήσεων» τις αφαιρεί. ' +
  'Το «Αποτέλεσμα κατά Trading 212» είναι το «Result» του Trading 212 για κάθε πώληση, που δεν τις αφαιρεί· η διαφορά των δύο είναι μόνο αυτές οι χρεώσεις. ' +
  'Οι καταθέσεις είναι τα ποσά που πιστώθηκαν, όπως τα δείχνει το Trading 212· οι χρεώσεις κατάθεσης με κάρτα εμφανίζονται χωριστά.';

export const DIVIDENDS_NOTE =
  'Ο φόρος που παρακρατήθηκε στο εξωτερικό είναι αυτός που αναφέρει το Trading 212 στο export του λογαριασμού (πηγή «Trading 212»), μετατρεμμένος σε ευρώ με την ισοτιμία του ίδιου του μερίσματος. ' +
  'Όπου δεν υπάρχει ακόμα export, είναι εκτίμηση (πηγή «Εκτίμηση»): μικτό μείον καθαρό, με την ισοτιμία της πλησιέστερης συναλλαγής στο ίδιο νόμισμα. ' +
  'Οι επιστροφές παρακρατημένου φόρου εμφανίζονται ως αρνητικός φόρος, με την περιγραφή του Trading 212.';

/** Where a dividend's tax figure comes from, for the reports. */
export const WITHHOLDING_SOURCE_LABEL: Record<
  DividendDetail['source'],
  string
> = {
  export: 'Trading 212',
  api: 'Trading 212 (API)',
  estimate: 'Εκτίμηση',
  adjustment: 'Επιστροφή/διόρθωση',
};

/** One line per year: gross dividends and the tax withheld, and how sure that is. */
export function dividendTaxLine(
  t: DividendTaxYear,
  money: (v: string) => string,
): string {
  const approx = t.estimated ? '~' : '';
  const source = t.estimated
    ? `εκτίμηση${t.partial ? ', ελλιπής' : ''}`
    : 'από το export του Trading 212';
  return `μικτά ${approx}${money(t.gross)}, φόρος που παρακρατήθηκε στο εξωτερικό ${approx}${money(t.withheld)} (${source}).`;
}

export const DISCLAIMER =
  'Η αναφορά παράγεται αυτόματα από τα δεδομένα του Trading 212 (API και export του λογαριασμού) και δεν αποτελεί φορολογική συμβουλή. ' +
  'Η φορολογική μεταχείριση κάθε ποσού πρέπει να επιβεβαιωθεί από λογιστή.';
