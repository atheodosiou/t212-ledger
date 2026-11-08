import { Decimal } from 'decimal.js';

/** source_type of a dividend tax adjustment (see LedgerService.exportClassifications). */
export const DIVIDEND_ADJUSTMENT = 'DIVIDEND_ADJUSTMENT';

/** What dividend reporting needs from a ledger entry. Numeric fields are decimal strings. */
export interface DividendInputEntry {
  id: string;
  occurredAt: Date;
  kind: string;
  sourceType?: string;
  ticker: string | null;
  displayTicker?: string | null;
  isin: string | null;
  instrumentName: string | null;
  instrumentCurrency: string | null;
  quantity: string | null;
  cashAmount: string;
  grossAmount: string | null;
  fxRate: string | null;
  note?: string | null;
}

/** A dividend row of Trading 212's CSV export (header → value). */
export interface DividendExportRow {
  occurredAt: Date;
  action: string;
  payload: Record<string, string>;
}

/**
 * Where the tax figure comes from:
 * - `export`: Trading 212's own figure, from its CSV export of the account. Exact.
 * - `api`: no export row, but no conversion either (a dividend paid in the account
 *   currency): gross from the API minus the net credited.
 * - `estimate`: no export row, and the gross had to be converted, at the FX rate of
 *   the nearest trade in that currency.
 * - `adjustment`: a later refund (negative tax) or charge of withheld tax.
 */
export type WithholdingSource = 'export' | 'api' | 'estimate' | 'adjustment';

export interface DividendDetail {
  entryId: string;
  date: Date;
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  shares: string | null;
  /** Gross in the instrument's currency, from Trading 212 (per-share amount × shares). */
  grossInstrument: string | null;
  instrumentCurrency: string | null;
  /** Net credited, account currency. Exact. */
  net: string;
  /** Instrument units per 1 account unit used for the conversion; null when unknown. */
  fxRate: string | null;
  /** Gross in account currency: net + withheld. */
  grossAccount: string | null;
  /** Tax withheld abroad, account currency. Negative for a refund. */
  withheld: string | null;
  /** The tax as Trading 212 states it, in its own currency (export only). */
  withheldOriginal: string | null;
  withheldCurrency: string | null;
  /** withheld / gross, in percent. */
  withholdingRate: string | null;
  source: WithholdingSource;
  estimated: boolean;
  /** Trading 212's description, for adjustments. */
  note: string | null;
}

const SAME_SHARES = new Decimal('1e-6');
const MATCH_WINDOW_MS = 36 * 3600_000;
const ACCOUNT_DECIMALS = 4;

/**
 * Dividends with the tax withheld abroad. When Trading 212's CSV export has the
 * dividend, its own withholding figure is used; otherwise (no export yet, a practice
 * account) the tax is estimated and marked so. An export row is used only if its
 * figures add up to the net Trading 212 credited, so a wrong match falls back to the
 * estimate instead of reporting a wrong tax.
 */
export function dividendDetails(
  entries: DividendInputEntry[],
  accountCurrency = 'EUR',
  exportRows: DividendExportRow[] = [],
): DividendDetail[] {
  const fxByCurrency = new Map<string, { time: number; rate: Decimal }[]>();
  for (const e of entries) {
    if (
      (e.kind === 'BUY' || e.kind === 'SELL') &&
      e.fxRate &&
      e.instrumentCurrency
    ) {
      const list = fxByCurrency.get(e.instrumentCurrency) ?? [];
      list.push({ time: e.occurredAt.getTime(), rate: new Decimal(e.fxRate) });
      fxByCurrency.set(e.instrumentCurrency, list);
    }
  }
  const nearestRate = (currency: string, time: number): Decimal | null => {
    let best: { distance: number; rate: Decimal } | null = null;
    for (const fx of fxByCurrency.get(currency) ?? []) {
      const distance = Math.abs(fx.time - time);
      if (!best || distance < best.distance) best = { distance, rate: fx.rate };
    }
    return best?.rate ?? null;
  };

  const unused = exportRows.filter(
    (r) => /^dividend\b/i.test(r.action) && !/adjustment/i.test(r.action),
  );
  const takeExportRow = (e: DividendInputEntry) => {
    if (!e.isin || !e.quantity) return null;
    const shares = new Decimal(e.quantity);
    const i = unused.findIndex(
      (r) =>
        r.payload.ISIN === e.isin &&
        r.payload['No. of shares'] &&
        new Decimal(r.payload['No. of shares'])
          .minus(shares)
          .abs()
          .lte(SAME_SHARES) &&
        Math.abs(r.occurredAt.getTime() - e.occurredAt.getTime()) <=
          MATCH_WINDOW_MS,
    );
    return i < 0 ? null : unused.splice(i, 1)[0];
  };

  return entries
    .filter((e) => e.kind === 'DIVIDEND')
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    .map((e): DividendDetail => {
      const net = new Decimal(e.cashAmount);
      const base = {
        entryId: e.id,
        date: e.occurredAt,
        ticker: e.displayTicker ?? e.ticker ?? '',
        isin: e.isin,
        instrumentName: e.instrumentName,
        shares: e.quantity,
        grossInstrument: e.grossAmount,
        instrumentCurrency: e.instrumentCurrency,
        net: net.toFixed(2),
        note: e.note ?? null,
      };

      if (e.sourceType === DIVIDEND_ADJUSTMENT) {
        // A refund of withheld tax is a negative tax; a charge, a positive one.
        return {
          ...base,
          fxRate: null,
          grossAccount: '0.00',
          withheld: net.negated().toFixed(2),
          withheldOriginal: null,
          withheldCurrency: null,
          withholdingRate: null,
          source: 'adjustment',
          estimated: false,
        };
      }

      const row = takeExportRow(e);
      const exact = row ? fromExport(row, net, accountCurrency) : null;
      if (exact) {
        const gross = net.plus(exact.withheld);
        return {
          ...base,
          fxRate: exact.fxRate,
          grossAccount: gross.toFixed(ACCOUNT_DECIMALS),
          withheld: exact.withheld.toFixed(ACCOUNT_DECIMALS),
          withheldOriginal: exact.original,
          withheldCurrency: exact.currency,
          withholdingRate: rate(exact.withheld, gross),
          source: 'export',
          estimated: false,
        };
      }

      const sameCurrency =
        !e.instrumentCurrency || e.instrumentCurrency === accountCurrency;
      const fx = sameCurrency
        ? new Decimal(1)
        : nearestRate(e.instrumentCurrency!, e.occurredAt.getTime());
      const grossAccount =
        e.grossAmount && fx && !fx.isZero()
          ? new Decimal(e.grossAmount).div(fx)
          : null;
      const withheld = grossAccount
        ? Decimal.max(0, grossAccount.minus(net))
        : null;
      return {
        ...base,
        fxRate: fx ? fx.toFixed() : null,
        grossAccount: grossAccount ? grossAccount.toFixed(2) : null,
        withheld: withheld ? withheld.toFixed(2) : null,
        withheldOriginal: null,
        withheldCurrency: null,
        withholdingRate:
          grossAccount && withheld ? rate(withheld, grossAccount) : null,
        source: sameCurrency ? 'api' : 'estimate',
        estimated: !sameCurrency,
      };
    });
}

/** @deprecated name kept for callers; see dividendDetails. */
export const estimateDividends = dividendDetails;

/**
 * Trading 212's withholding for one dividend row, in account currency. For dividends
 * the CSV's "Exchange rate" is account units per instrument unit (the inverse of the
 * rate on trades). The row is trusted only if net per share × shares × rate gives the
 * credited net (to the cent, as Trading 212 rounds).
 */
function fromExport(
  row: DividendExportRow,
  net: Decimal,
  accountCurrency: string,
): {
  withheld: Decimal;
  original: string;
  currency: string;
  fxRate: string;
} | null {
  const c = row.payload;
  const total = c.Total ? new Decimal(c.Total) : null;
  if (!total || !total.minus(net).abs().lte('0.005')) return null;
  const whtText = c['Withholding tax']?.trim();
  const whtCurrency =
    c['Currency (Withholding tax)']?.trim() || accountCurrency;
  const original = new Decimal(whtText || 0);
  const priceCurrency =
    c['Currency (Price / share)']?.trim() || accountCurrency;
  const fx =
    priceCurrency === accountCurrency
      ? new Decimal(1)
      : c['Exchange rate']
        ? new Decimal(c['Exchange rate'])
        : null;
  if (!fx || fx.isZero()) return null;
  if (c['Price / share'] && c['No. of shares']) {
    const computed = new Decimal(c['Price / share'])
      .times(c['No. of shares'])
      .times(fx);
    if (computed.minus(total).abs().gt('0.01')) return null;
  }
  const withheld =
    whtCurrency === accountCurrency
      ? original
      : whtCurrency === priceCurrency
        ? original.times(fx)
        : null;
  if (!withheld) return null;
  return {
    withheld,
    original: original.toFixed(2),
    currency: whtCurrency,
    // Reported like trades: instrument units per account unit.
    fxRate: new Decimal(1).div(fx).toFixed(6),
  };
}

function rate(withheld: Decimal, gross: Decimal): string | null {
  return gross.gt(0) ? withheld.div(gross).times(100).toFixed(1) : null;
}
