import { Decimal } from 'decimal.js';
import type { EngineWarning, Holding } from '../ledger/cost-basis.js';
import type {
  T212AccountSummary,
  T212Position,
} from '../trading212/t212.types.js';

export type IssueKind =
  'position' | 'cash' | 'unreadable' | 'unmapped' | 'history';
export type IssueSeverity = 'error' | 'warning';

export interface ReconciliationIssue {
  kind: IssueKind;
  severity: IssueSeverity;
  message: string;
}

export interface Reconciliation {
  checkedAt: string;
  /** No errors (warnings allowed). */
  ok: boolean;
  issues: ReconciliationIssue[];
  /** What was compared, for the "all good" message. */
  compared: { positions: number; cashLedger: string; cashBroker: string };
  /** Set when new data arrived but the check could not run; the next sync retries. */
  stale?: boolean;
}

export interface ReconcileInput {
  /** Open positions according to our replay of the history. */
  holdings: Holding[];
  /** Open positions according to Trading 212 right now. */
  positions: T212Position[];
  summary: T212AccountSummary;
  /** Sum of every cash movement in the ledger. */
  ledgerCash: string;
  displayTickers: Map<string, string>;
  /** Stored records the normalizer could not read (wrong shape). */
  unreadable: { source: string; externalId: string; problem: string }[];
  /** Ledger entries of kind OTHER, by Trading 212 type. */
  unmapped: { sourceType: string; count: number }[];
  warnings: EngineWarning[];
  now: Date;
}

const QTY_TOLERANCE = new Decimal('0.000001');
/** Trading 212 rounds each cash movement to cents; allow a few cents of drift. */
const CASH_TOLERANCE = new Decimal('0.05');

const qty = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 8 });
const eur = (v: Decimal.Value) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(
    Number(v),
  );

/**
 * Compares the history we replayed with what Trading 212 says right now. If our
 * share counts or cash differ, a record is missing or misread, and every figure
 * built on the history (results, taxes, exports) may be wrong.
 */
export function reconcile(input: ReconcileInput): Reconciliation {
  const issues: ReconciliationIssue[] = [];
  const ours = new Map(input.holdings.map((h) => [h.isin ?? h.ticker, h]));
  const name = (ticker: string) =>
    input.displayTickers.get(ticker) ?? ticker.split('_')[0];

  for (const p of input.positions) {
    const key = p.instrument.isin;
    const held = ours.get(key);
    ours.delete(key);
    const brokerQty = new Decimal(p.quantity);
    const ourQty = new Decimal(held?.quantity ?? 0);
    if (brokerQty.minus(ourQty).abs().gt(QTY_TOLERANCE)) {
      issues.push({
        kind: 'position',
        severity: 'error',
        message: `${name(p.instrument.ticker)}: το Trading 212 δείχνει ${qty.format(brokerQty.toNumber())} μετοχές, το ιστορικό ${qty.format(ourQty.toNumber())}.`,
      });
    }
  }
  for (const h of ours.values()) {
    issues.push({
      kind: 'position',
      severity: 'error',
      message: `${h.ticker}: το ιστορικό δείχνει ${qty.format(Number(h.quantity))} μετοχές, το Trading 212 καμία.`,
    });
  }

  const cash = input.summary.cash ?? {};
  const brokerCash = new Decimal(cash.availableToTrade ?? 0)
    .plus(cash.reservedForOrders ?? 0)
    .plus(cash.inPies ?? 0);
  const ledgerCash = new Decimal(input.ledgerCash);
  if (brokerCash.minus(ledgerCash).abs().gt(CASH_TOLERANCE)) {
    issues.push({
      kind: 'cash',
      severity: 'error',
      message: `Μετρητά: το Trading 212 δείχνει ${eur(brokerCash)}, το ιστορικό ${eur(ledgerCash)} (διαφορά ${eur(brokerCash.minus(ledgerCash))}).`,
    });
  }

  if (input.unreadable.length) {
    const examples = input.unreadable
      .slice(0, 3)
      .map((u) => `${u.source} ${u.externalId}: ${u.problem}`)
      .join(' · ');
    issues.push({
      kind: 'unreadable',
      severity: 'error',
      message: `${input.unreadable.length} εγγραφές του Trading 212 δεν έχουν τη μορφή που περιμένουμε και δεν μετράνε στους υπολογισμούς. ${examples}`,
    });
  }

  for (const u of input.unmapped) {
    issues.push({
      kind: 'unmapped',
      severity: 'warning',
      message: `${u.count} κινήσεις τύπου «${u.sourceType}» δεν αντιστοιχούν σε γνωστή κατηγορία και εμφανίζονται ως «Άλλο».`,
    });
  }

  for (const w of input.warnings) {
    issues.push({ kind: 'history', severity: 'warning', message: w.message });
  }

  return {
    checkedAt: input.now.toISOString(),
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    compared: {
      positions: input.positions.length,
      cashLedger: ledgerCash.toFixed(2),
      cashBroker: brokerCash.toFixed(2),
    },
  };
}

/** Whether a sync should run the check: new data, never checked, a failed attempt, or a day old. */
export function needsCheck(
  previous: Reconciliation | null,
  newRecords: number,
  now: Date,
): boolean {
  if (newRecords > 0 || !previous || previous.stale) return true;
  return now.getTime() - Date.parse(previous.checkedAt) >= 24 * 60 * 60 * 1000;
}
