/**
 * Line-by-line comparison of what the API returned with Trading 212's own CSV export
 * of the same period. Every filled order, dividend and cash movement must appear in
 * both, with the same numbers. Matching rules were confirmed on a real account:
 *
 * - Orders: same ISIN, side and share count; the CSV time can be up to a minute off the
 *   API fill time, so the nearest fill within two minutes is taken. Price, FX rate,
 *   EUR total, currency conversion fee and Trading 212's "Result" must be equal.
 * - Cash movements (deposits, interest, card costs, adjustments): the CSV ID is the
 *   API reference. A card deposit is one CSV row (net amount and deposit fee) and two
 *   API records (the gross amount, and a fee at the same instant).
 * - Dividends: the CSV has no ID; same ISIN and share count, paid within 36 hours.
 */

export interface ExportRow {
  rowKey: string;
  action: string;
  occurredAt: Date;
  externalId: string | null;
  payload: Record<string, string>;
}

/** The API records the check needs (raw events). */
export interface ApiRecord {
  source: 'ORDER' | 'DIVIDEND' | 'TRANSACTION';
  externalId: string;
  occurredAt: Date;
  payload: unknown;
}

export type ExportDifferenceKind =
  'missing-from-api' | 'missing-from-export' | 'mismatch';

export interface ExportDifference {
  kind: ExportDifferenceKind;
  date: string;
  /** What the record is, e.g. "Πώληση TSM 5,43" (plain text). */
  what: string;
  detail: string;
}

export interface ExportCheck {
  checkedAt: string;
  /** The period both sides were compared over. */
  from: string;
  to: string;
  /** No differences. */
  ok: boolean;
  compared: { orders: number; dividends: number; cash: number };
  differences: ExportDifference[];
  /** More differences than are kept. */
  truncated: number;
}

const MAX_DIFFERENCES = 100;
const ORDER_TIME_TOLERANCE_MS = 120_000;
const DIVIDEND_TIME_TOLERANCE_MS = 36 * 3600_000;

export const isOrderAction = (action: string) =>
  /^(market|limit|stop|stop limit) (buy|sell)$/i.test(action);
export const isDividendAction = (action: string) =>
  /^dividend\b/i.test(action) && !isDividendAdjustment(action);
export const isDividendAdjustment = (action: string) =>
  /^dividend adjustment$/i.test(action);

const num = (v: string | undefined): number | null =>
  v === undefined || v.trim() === '' ? null : Number(v);
const near = (a: number | null, b: number | null | undefined, tol: number) =>
  a !== null && b !== null && b !== undefined && Math.abs(a - b) <= tol;
const day = (d: Date) => d.toISOString().slice(0, 10);

interface OrderPayload {
  order: { side: 'BUY' | 'SELL'; ticker: string; instrument: { isin: string } };
  fill: {
    quantity: number;
    price: number;
    filledAt: string;
    walletImpact?: {
      netValue: number;
      fxRate?: number;
      realisedProfitLoss?: number;
      taxes?: { name: string; quantity: number }[];
    };
  } | null;
}
interface DividendPayload {
  amount: number;
  quantity: number;
  paidOn: string;
  ticker: string;
  instrument?: { isin: string };
}
interface CashPayload {
  type: string;
  amount: number;
  dateTime: string;
  reference: string;
}

export function checkAgainstExport(
  api: ApiRecord[],
  rows: ExportRow[],
  period: { from: Date; to: Date },
  now = new Date(),
): ExportCheck {
  const differences: ExportDifference[] = [];
  const inPeriod = (d: Date) => d >= period.from && d <= period.to;
  const add = (d: ExportDifference) => differences.push(d);

  // ── Orders
  const fills = new Map<string, { rec: ApiRecord; p: OrderPayload }[]>();
  const fillKey = (isin: string, side: string, qty: number) =>
    `${isin}|${side}|${Math.abs(qty).toFixed(6)}`;
  for (const rec of api) {
    if (rec.source !== 'ORDER' || !inPeriod(rec.occurredAt)) continue;
    const p = rec.payload as OrderPayload;
    if (!p.fill) continue;
    const k = fillKey(p.order.instrument.isin, p.order.side, p.fill.quantity);
    (fills.get(k) ?? fills.set(k, []).get(k)!).push({ rec, p });
  }
  let orders = 0;
  for (const r of rows.filter((r) => isOrderAction(r.action))) {
    const c = r.payload;
    const side = /buy$/i.test(r.action) ? 'BUY' : 'SELL';
    const what = `${side === 'BUY' ? 'Αγορά' : 'Πώληση'} ${c.Ticker} ${c['No. of shares']}`;
    const list =
      fills.get(fillKey(c.ISIN, side, Number(c['No. of shares']))) ?? [];
    let best = -1;
    let gap = Infinity;
    list.forEach((f, i) => {
      const g = Math.abs(
        new Date(f.p.fill!.filledAt).getTime() - r.occurredAt.getTime(),
      );
      if (g < gap) [best, gap] = [i, g];
    });
    if (best < 0 || gap > ORDER_TIME_TOLERANCE_MS) {
      add({
        kind: 'missing-from-api',
        date: day(r.occurredAt),
        what,
        detail: `Στο export (ID ${c.ID}), όχι στο API`,
      });
      continue;
    }
    const [{ p }] = list.splice(best, 1);
    orders++;
    const w = p.fill!.walletImpact ?? { netValue: NaN };
    const fxFee = (w.taxes ?? [])
      .filter((t) => t.name === 'CURRENCY_CONVERSION_FEE')
      .reduce((s, t) => s + Math.abs(t.quantity), 0);
    const problems: string[] = [];
    if (!near(num(c['Price / share']), p.fill!.price, 1e-6))
      problems.push(`τιμή ${c['Price / share']} ≠ ${p.fill!.price}`);
    if (
      num(c['Exchange rate']) !== null &&
      w.fxRate !== undefined &&
      !near(num(c['Exchange rate']), w.fxRate, 1e-6)
    )
      problems.push(`ισοτιμία ${c['Exchange rate']} ≠ ${w.fxRate}`);
    if (!near(num(c.Total), Math.abs(w.netValue), 0.005))
      problems.push(`σύνολο ${c.Total} ≠ ${Math.abs(w.netValue)}`);
    if (!near(num(c['Currency conversion fee']) ?? 0, fxFee, 0.005))
      problems.push(
        `χρέωση μετατροπής ${c['Currency conversion fee'] || 0} ≠ ${fxFee}`,
      );
    if (
      side === 'SELL' &&
      num(c.Result) !== null &&
      !near(num(c.Result), w.realisedProfitLoss, 0.005)
    )
      problems.push(`αποτέλεσμα ${c.Result} ≠ ${w.realisedProfitLoss ?? '—'}`);
    if (problems.length)
      add({
        kind: 'mismatch',
        date: day(r.occurredAt),
        what,
        detail: problems.join(' · '),
      });
  }
  for (const list of fills.values())
    for (const { rec, p } of list)
      add({
        kind: 'missing-from-export',
        date: day(rec.occurredAt),
        what: `${p.order.side === 'BUY' ? 'Αγορά' : 'Πώληση'} ${p.order.ticker} ${Math.abs(p.fill!.quantity)}`,
        detail: 'Στο API, όχι στο export',
      });

  // ── Dividends
  const dividends = api
    .filter((r) => r.source === 'DIVIDEND' && inPeriod(r.occurredAt))
    .map((rec) => ({ rec, p: rec.payload as DividendPayload }));
  let dividendCount = 0;
  for (const r of rows.filter((r) => isDividendAction(r.action))) {
    const c = r.payload;
    const what = `Μέρισμα ${c.Ticker}`;
    const i = dividends.findIndex(
      ({ p }) =>
        p.instrument?.isin === c.ISIN &&
        near(num(c['No. of shares']), p.quantity, 1e-6) &&
        Math.abs(new Date(p.paidOn).getTime() - r.occurredAt.getTime()) <=
          DIVIDEND_TIME_TOLERANCE_MS,
    );
    if (i < 0) {
      add({
        kind: 'missing-from-api',
        date: day(r.occurredAt),
        what,
        detail: 'Στο export, όχι στο API',
      });
      continue;
    }
    const [{ p }] = dividends.splice(i, 1);
    dividendCount++;
    if (!near(num(c.Total), p.amount, 0.005))
      add({
        kind: 'mismatch',
        date: day(r.occurredAt),
        what,
        detail: `καθαρό ${c.Total} ≠ ${p.amount}`,
      });
  }
  for (const { rec, p } of dividends)
    add({
      kind: 'missing-from-export',
      date: day(rec.occurredAt),
      what: `Μέρισμα ${p.ticker}`,
      detail: 'Στο API, όχι στο export',
    });

  // ── Cash movements, by reference
  const cash = new Map(
    api
      .filter((r) => r.source === 'TRANSACTION' && inPeriod(r.occurredAt))
      .map((rec) => [rec.externalId, rec.payload as CashPayload]),
  );
  // Deposit fees: API records of type FEE at the same instant as a deposit.
  const feesAt = new Map<number, CashPayload[]>();
  for (const p of cash.values()) {
    if (p.type !== 'FEE') continue;
    const t = new Date(p.dateTime).getTime();
    (feesAt.get(t) ?? feesAt.set(t, []).get(t)!).push(p);
  }
  let cashCount = 0;
  for (const r of rows.filter(
    (r) => !isOrderAction(r.action) && !isDividendAction(r.action),
  )) {
    const c = r.payload;
    const what = `${r.action} ${c.Total}`;
    const p = c.ID ? cash.get(c.ID) : undefined;
    if (!p) {
      add({
        kind: 'missing-from-api',
        date: day(r.occurredAt),
        what,
        detail: `Στο export (ID ${c.ID || '—'}), όχι στο API`,
      });
      continue;
    }
    cash.delete(c.ID);
    cashCount++;
    const depositFee = num(c['Deposit fee']) ?? 0;
    // The API records the amount charged (net + fee); the export the net and the fee apart.
    if (!near((num(c.Total) ?? NaN) - depositFee, p.amount, 0.005))
      add({
        kind: 'mismatch',
        date: day(r.occurredAt),
        what,
        detail: `ποσό ${c.Total} (χρέωση ${depositFee}) ≠ ${p.amount}`,
      });
    if (depositFee) {
      const t = new Date(p.dateTime).getTime();
      const fees = feesAt.get(t) ?? [];
      const j = fees.findIndex((f) => near(depositFee, f.amount, 0.005));
      if (j < 0) {
        add({
          kind: 'mismatch',
          date: day(r.occurredAt),
          what,
          detail: `χρέωση κατάθεσης ${depositFee} χωρίς αντίστοιχη στο API`,
        });
      } else {
        const [fee] = fees.splice(j, 1);
        cash.delete(fee.reference);
      }
    }
  }
  for (const [ref, p] of cash)
    add({
      kind: 'missing-from-export',
      date: p.dateTime.slice(0, 10),
      what: `${p.type} ${p.amount}`,
      detail: `Στο API (${ref}), όχι στο export`,
    });

  differences.sort((a, b) => a.date.localeCompare(b.date));
  return {
    checkedAt: now.toISOString(),
    from: period.from.toISOString(),
    to: period.to.toISOString(),
    ok: differences.length === 0,
    compared: { orders, dividends: dividendCount, cash: cashCount },
    differences: differences.slice(0, MAX_DIFFERENCES),
    truncated: Math.max(0, differences.length - MAX_DIFFERENCES),
  };
}

/** A stable key for a CSV row: its ID, or (dividends have none) its content. */
export function exportRowKey(row: Record<string, string>): string {
  if (row.ID) return `id:${row.ID}`;
  return [
    'row',
    row.Action,
    row['Time (UTC)'],
    row.ISIN,
    row['No. of shares'],
    row.Total,
  ].join('|');
}

/** "2024-01-09 18:39:59" or "2024-01-09 18:39:59+00:00" (UTC) → Date. */
export function exportTime(value: string): Date {
  const v = value.trim().replace(' ', 'T');
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`);
}
