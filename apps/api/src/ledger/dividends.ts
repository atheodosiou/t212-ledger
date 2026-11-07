import { Decimal } from 'decimal.js';

/** What dividend estimation needs from a ledger entry. Numeric fields are decimal strings. */
export interface DividendInputEntry {
  id: string;
  occurredAt: Date;
  kind: string;
  ticker: string | null;
  displayTicker?: string | null;
  isin: string | null;
  instrumentName: string | null;
  instrumentCurrency: string | null;
  quantity: string | null;
  cashAmount: string;
  grossAmount: string | null;
  fxRate: string | null;
}

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
  /** Gross in account currency. Estimated unless the instrument trades in the account currency. */
  grossAccount: string | null;
  /** Gross minus net, account currency: the tax withheld abroad. */
  withheld: string | null;
  /** withheld / gross, in percent. Noisy for tiny dividends because net is rounded to cents. */
  withholdingRate: string | null;
  estimated: boolean;
}

/**
 * Trading 212 reports the net dividend in the account currency and the gross per
 * share in the instrument currency, but not the tax withheld. The gross is converted
 * with the FX rate of the account's trade in that currency closest in time, which
 * makes the withholding an estimate (marked as such) unless no conversion is needed.
 */
export function estimateDividends(entries: DividendInputEntry[], accountCurrency = 'EUR'): DividendDetail[] {
  const fxByCurrency = new Map<string, { time: number; rate: Decimal }[]>();
  for (const e of entries) {
    if ((e.kind === 'BUY' || e.kind === 'SELL') && e.fxRate && e.instrumentCurrency) {
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

  return entries
    .filter((e) => e.kind === 'DIVIDEND')
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    .map((e) => {
      const net = new Decimal(e.cashAmount);
      const sameCurrency = !e.instrumentCurrency || e.instrumentCurrency === accountCurrency;
      const rate = sameCurrency ? new Decimal(1) : nearestRate(e.instrumentCurrency!, e.occurredAt.getTime());
      const grossAccount = e.grossAmount && rate && !rate.isZero() ? new Decimal(e.grossAmount).div(rate) : null;
      const withheld = grossAccount ? Decimal.max(0, grossAccount.minus(net)) : null;
      return {
        entryId: e.id,
        date: e.occurredAt,
        ticker: e.displayTicker ?? e.ticker ?? '',
        isin: e.isin,
        instrumentName: e.instrumentName,
        shares: e.quantity,
        grossInstrument: e.grossAmount,
        instrumentCurrency: e.instrumentCurrency,
        net: net.toFixed(2),
        fxRate: rate ? rate.toFixed() : null,
        grossAccount: grossAccount ? grossAccount.toFixed(2) : null,
        withheld: withheld ? withheld.toFixed(2) : null,
        withholdingRate:
          grossAccount && withheld && grossAccount.gt(0) ? withheld.div(grossAccount).times(100).toFixed(1) : null,
        estimated: !sameCurrency,
      };
    });
}
