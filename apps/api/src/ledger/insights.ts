import { Decimal } from 'decimal.js';
import {
  computeCostBasis,
  DEFAULT_TAX_TIME_ZONE,
  depositFeeIds,
  taxYearOf,
  type EngineEntry,
  type PositionEvent,
} from './cost-basis.js';
import type { DividendDetail } from './dividends.js';
import { fillMonths } from './timeline.js';

/**
 * What the history says about how the user invests, beyond what Trading 212 shows:
 * how long positions were held and how that went, which instruments made or lost
 * money, what investing cost, and the currencies and countries the money sits in.
 * All from the ledger (average cost), no market prices.
 */

export interface InsightsEntry extends EngineEntry {
  instrumentCurrency: string | null;
}

/** A position from the first buy to the sale that emptied it. */
export interface HoldingCycle {
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  opened: Date;
  closed: Date;
  days: number;
  /** Everything bought during the cycle, fees included. */
  invested: string;
  realisedPnl: string;
  /** realisedPnl / invested, in percent. */
  returnPct: string;
}

export interface HoldingBucket {
  key: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'LONGER';
  positions: number;
  wins: number;
  realisedPnl: string;
}

export interface InstrumentResult {
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  realisedPnl: string;
  sales: number;
  /** Still held (part of it). */
  open: boolean;
}

export interface CostYear {
  year: number;
  currencyConversion: string;
  transactionTaxes: string;
  depositFees: string;
  otherFees: string;
  /** Tax withheld abroad on dividends beyond what the Greek 5% can credit. */
  dividendTaxLost: string;
  total: string;
  purchases: string;
  realisedPnl: string;
}

export interface Exposure {
  key: string;
  invested: string;
  /** Percent of all money in open positions. */
  share: string;
}

export interface Insights {
  holding: { cycles: HoldingCycle[]; buckets: HoldingBucket[] };
  results: {
    instruments: InstrumentResult[];
    closedPositions: number;
    wins: number;
    winRate: string | null;
    averageWin: string | null;
    averageLoss: string | null;
    /** Sum of gains / sum of losses over closed positions. */
    profitFactor: string | null;
  };
  costs: { years: CostYear[]; total: CostYear };
  exposure: {
    currencies: Exposure[];
    countries: Exposure[];
    /** Money in open positions per currency at the end of every month. */
    currencyMonths: {
      month: string;
      invested: string;
      values: string[];
      positions: number;
    }[];
    currencySeries: string[];
  };
}

/** Fees Trading 212 itemises on fills (walletImpact.taxes), per entry id. */
export type FillCharges = Map<string, { name: string; amount: string }[]>;

const ZERO = new Decimal(0);
const DAY_MS = 86_400_000;

export function bucketOf(days: number): HoldingBucket['key'] {
  if (days < 1) return 'DAY';
  if (days <= 7) return 'WEEK';
  if (days <= 31) return 'MONTH';
  if (days <= 366) return 'YEAR';
  return 'LONGER';
}

export function holdingCycles(events: PositionEvent[]): HoldingCycle[] {
  const open = new Map<
    string,
    {
      opened: Date;
      invested: Decimal;
      pnl: Decimal;
      ticker: string;
      name: string | null;
      isin: string | null;
    }
  >();
  const cycles: HoldingCycle[] = [];
  const sorted = [...events].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  for (const e of sorted) {
    const key = e.isin ?? e.ticker;
    const held = new Decimal(e.positionQuantity);
    let c = open.get(key);
    if (e.kind === 'BUY') {
      if (!c) {
        c = {
          opened: e.date,
          invested: ZERO,
          pnl: ZERO,
          ticker: e.ticker,
          name: e.instrumentName,
          isin: e.isin,
        };
        open.set(key, c);
      }
      if (e.pricePerShare)
        c.invested = c.invested.plus(
          new Decimal(e.quantity).abs().times(e.pricePerShare),
        );
    } else if (e.kind === 'SELL' && c) {
      if (e.realisedPnl) c.pnl = c.pnl.plus(e.realisedPnl);
      c.ticker = e.ticker;
      if (held.lte(0)) {
        open.delete(key);
        const days = (e.date.getTime() - c.opened.getTime()) / DAY_MS;
        cycles.push({
          ticker: c.ticker,
          isin: c.isin,
          instrumentName: c.name,
          opened: c.opened,
          closed: e.date,
          days: Math.round(days * 10) / 10,
          invested: c.invested.toFixed(2),
          realisedPnl: c.pnl.toFixed(2),
          returnPct: c.invested.gt(0)
            ? c.pnl.div(c.invested).times(100).toFixed(1)
            : '0.0',
        });
      }
    }
  }
  return cycles;
}

export function buildInsights(
  entries: InsightsEntry[],
  dividends: DividendDetail[],
  charges: FillCharges,
  options: { now?: Date; timeZone?: string; dividendRate?: string } = {},
): Insights {
  const timeZone = options.timeZone ?? DEFAULT_TAX_TIME_ZONE;
  const yearOf = taxYearOf(timeZone);
  const engine = computeCostBasis(entries, 'AVERAGE', timeZone);

  // ── Holding periods ────────────────────────────────────────────────────────
  const cycles = holdingCycles(engine.positionEvents);
  const bucketKeys: HoldingBucket['key'][] = [
    'DAY',
    'WEEK',
    'MONTH',
    'YEAR',
    'LONGER',
  ];
  const buckets = bucketKeys.map((key) => {
    const inBucket = cycles.filter((c) => bucketOf(c.days) === key);
    return {
      key,
      positions: inBucket.length,
      wins: inBucket.filter((c) => Number(c.realisedPnl) > 0).length,
      realisedPnl: inBucket
        .reduce((s, c) => s.plus(c.realisedPnl), ZERO)
        .toFixed(2),
    };
  });

  // ── Winners and losers ─────────────────────────────────────────────────────
  const held = new Set(engine.holdings.map((h) => h.isin ?? h.ticker));
  const byInstrument = new Map<string, InstrumentResult & { pnl: Decimal }>();
  for (const s of engine.sales) {
    const key = s.isin ?? s.ticker;
    const r = byInstrument.get(key) ?? {
      ticker: s.ticker,
      isin: s.isin,
      instrumentName: s.instrumentName,
      realisedPnl: '0',
      sales: 0,
      open: held.has(key),
      pnl: ZERO,
    };
    r.pnl = r.pnl.plus(s.realisedPnl);
    r.sales++;
    r.ticker = s.ticker;
    byInstrument.set(key, r);
  }
  const instruments = [...byInstrument.values()]
    .map(({ pnl, ...r }) => ({ ...r, realisedPnl: pnl.toFixed(2) }))
    .sort((a, b) => Number(b.realisedPnl) - Number(a.realisedPnl));
  const gains = cycles
    .filter((c) => Number(c.realisedPnl) > 0)
    .map((c) => new Decimal(c.realisedPnl));
  const losses = cycles
    .filter((c) => Number(c.realisedPnl) < 0)
    .map((c) => new Decimal(c.realisedPnl).abs());
  const sum = (v: Decimal[]) => v.reduce((a, b) => a.plus(b), ZERO);

  // ── Costs ──────────────────────────────────────────────────────────────────
  const years = new Map<
    number,
    Record<Exclude<keyof CostYear, 'year'>, Decimal>
  >();
  const year = (y: number) => {
    let r = years.get(y);
    if (!r) {
      r = {
        currencyConversion: ZERO,
        transactionTaxes: ZERO,
        depositFees: ZERO,
        otherFees: ZERO,
        dividendTaxLost: ZERO,
        total: ZERO,
        purchases: ZERO,
        realisedPnl: ZERO,
      };
      years.set(y, r);
    }
    return r;
  };
  const depositFees = depositFeeIds(entries);
  for (const e of entries) {
    const r = year(yearOf(e.occurredAt));
    if (e.kind === 'BUY')
      r.purchases = r.purchases.plus(new Decimal(e.cashAmount).abs());
    if (e.kind === 'FEE') {
      const fee = new Decimal(e.cashAmount).abs();
      if (depositFees.has(e.id)) r.depositFees = r.depositFees.plus(fee);
      else r.otherFees = r.otherFees.plus(fee);
    }
    if (e.kind !== 'BUY' && e.kind !== 'SELL') continue;
    const itemised = charges.get(e.id);
    if (itemised?.length) {
      for (const c of itemised) {
        const amount = new Decimal(c.amount).abs();
        if (c.name === 'CURRENCY_CONVERSION_FEE')
          r.currencyConversion = r.currencyConversion.plus(amount);
        else if (/TAX|STAMP|DUTY|LEVY/.test(c.name))
          r.transactionTaxes = r.transactionTaxes.plus(amount);
        else r.otherFees = r.otherFees.plus(amount);
      }
    } else if (Number(e.fees)) {
      r.otherFees = r.otherFees.plus(e.fees);
    }
  }
  for (const s of engine.sales) {
    const r = year(yearOf(s.date));
    r.realisedPnl = r.realisedPnl.plus(s.realisedPnl);
  }
  const rate = new Decimal(options.dividendRate ?? '0.05');
  for (const d of dividends) {
    const r = year(yearOf(d.date));
    const withheld = new Decimal(d.withheld ?? 0);
    if (d.source === 'adjustment') {
      // A refund lowers what was lost; a charge adds to it.
      r.dividendTaxLost = r.dividendTaxLost.plus(withheld);
      continue;
    }
    const credit = d.grossAccount
      ? Decimal.min(
          withheld,
          new Decimal(d.grossAccount).times(rate).toDecimalPlaces(2),
        )
      : ZERO;
    r.dividendTaxLost = r.dividendTaxLost.plus(
      Decimal.max(0, withheld.minus(credit)),
    );
  }
  const costYears: CostYear[] = [...years.entries()]
    .sort(([a], [b]) => a - b)
    .map(([y, r]) => {
      const total = r.currencyConversion
        .plus(r.transactionTaxes)
        .plus(r.depositFees)
        .plus(r.otherFees)
        .plus(Decimal.max(0, r.dividendTaxLost));
      return {
        year: y,
        currencyConversion: r.currencyConversion.toFixed(2),
        transactionTaxes: r.transactionTaxes.toFixed(2),
        depositFees: r.depositFees.toFixed(2),
        otherFees: r.otherFees.toFixed(2),
        dividendTaxLost: Decimal.max(0, r.dividendTaxLost).toFixed(2),
        total: total.toFixed(2),
        purchases: r.purchases.toFixed(2),
        realisedPnl: r.realisedPnl.toFixed(2),
      };
    });
  const totalOf = (field: Exclude<keyof CostYear, 'year'>) =>
    costYears.reduce((s, y) => s.plus(y[field]), ZERO).toFixed(2);
  const costTotal: CostYear = {
    year: 0,
    currencyConversion: totalOf('currencyConversion'),
    transactionTaxes: totalOf('transactionTaxes'),
    depositFees: totalOf('depositFees'),
    otherFees: totalOf('otherFees'),
    dividendTaxLost: totalOf('dividendTaxLost'),
    total: totalOf('total'),
    purchases: totalOf('purchases'),
    realisedPnl: totalOf('realisedPnl'),
  };

  // ── Currency and country ───────────────────────────────────────────────────
  const currencyOf = new Map<string, string>();
  for (const e of entries)
    if ((e.kind === 'BUY' || e.kind === 'SELL') && e.instrumentCurrency)
      // London prices are in pence (GBX); the currency is the pound.
      currencyOf.set(
        e.isin ?? e.ticker ?? '',
        e.instrumentCurrency === 'GBX' ? 'GBP' : e.instrumentCurrency,
      );
  const currencyKey = (key: string) => currencyOf.get(key) ?? '—';
  const countryKey = (key: string) =>
    /^[A-Z]{2}/.test(key) ? key.slice(0, 2) : '—';

  const totalHeld = engine.holdings.reduce((s, h) => s.plus(h.costBasis), ZERO);
  const exposure = (group: (key: string) => string): Exposure[] => {
    const sums = new Map<string, Decimal>();
    for (const h of engine.holdings) {
      const k = group(h.isin ?? h.ticker);
      sums.set(k, (sums.get(k) ?? ZERO).plus(h.costBasis));
    }
    return [...sums.entries()]
      .sort(([, a], [, b]) => b.comparedTo(a))
      .map(([key, v]) => ({
        key,
        invested: v.toFixed(2),
        share: totalHeld.gt(0) ? v.div(totalHeld).times(100).toFixed(1) : '0.0',
      }));
  };

  const monthOf = monthKey(timeZone);
  const monthList = fillMonths([
    ...entries.map((e) => monthOf(e.occurredAt)),
    ...(options.now ? [monthOf(options.now)] : []),
  ]);
  const currencies = exposure(currencyKey);
  const seriesKeys = [
    ...new Set(
      engine.positionEvents.map((e) => currencyKey(e.isin ?? e.ticker)),
    ),
  ].sort();
  const costByKey = new Map<string, Decimal>();
  const sortedEvents = [...engine.positionEvents].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  let i = 0;
  const currencyMonths = monthList.map((month) => {
    for (
      ;
      i < sortedEvents.length && monthOf(sortedEvents[i].date) <= month;
      i++
    ) {
      const e = sortedEvents[i];
      const q = new Decimal(e.positionQuantity);
      costByKey.set(
        e.isin ?? e.ticker,
        e.averageCost && q.gt(0) ? q.times(e.averageCost) : ZERO,
      );
    }
    const values = seriesKeys.map(() => ZERO);
    let positions = 0;
    for (const [key, v] of costByKey) {
      if (v.lte(0)) continue;
      positions++;
      const idx = seriesKeys.indexOf(currencyKey(key));
      values[idx] = values[idx].plus(v);
    }
    return {
      month,
      invested: sum(values).toFixed(2),
      values: values.map((v) => v.toFixed(2)),
      positions,
    };
  });

  return {
    holding: { cycles, buckets },
    results: {
      instruments,
      closedPositions: cycles.length,
      wins: gains.length,
      winRate: cycles.length
        ? ((gains.length / cycles.length) * 100).toFixed(0)
        : null,
      averageWin: gains.length ? sum(gains).div(gains.length).toFixed(2) : null,
      averageLoss: losses.length
        ? sum(losses).div(losses.length).neg().toFixed(2)
        : null,
      profitFactor:
        losses.length && gains.length
          ? sum(gains).div(sum(losses)).toFixed(2)
          : null,
    },
    costs: { years: costYears, total: costTotal },
    exposure: {
      currencies,
      countries: exposure(countryKey),
      currencyMonths,
      currencySeries: seriesKeys,
    },
  };
}

function monthKey(timeZone: string): (date: Date) => string {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  });
  return (date) => format.format(date).slice(0, 7);
}
