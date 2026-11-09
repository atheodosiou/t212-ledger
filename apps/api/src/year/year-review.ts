import { Decimal } from 'decimal.js';
import {
  computeCostBasis,
  DEFAULT_TAX_TIME_ZONE,
  taxYearOf,
  type Holding,
} from '../ledger/cost-basis.js';
import type { DividendDetail } from '../ledger/dividends.js';
import {
  buildInsights,
  type CostYear,
  type FillCharges,
  type HoldingCycle,
  type InsightsEntry,
} from '../ledger/insights.js';

/**
 * "Your year": one calendar year of investing in a page, summed over the user's
 * accounts. Everything comes from the ledger (no market prices); amounts in EUR.
 */

export interface AccountHistory {
  entries: InsightsEntry[];
  dividends: DividendDetail[];
  charges: FillCharges;
}

export interface YearTotals {
  deposits: string;
  withdrawals: string;
  purchases: string;
  buys: number;
  saleProceeds: string;
  sells: number;
  realisedPnl: string;
  /** Net of the tax withheld abroad, as credited. */
  dividends: string;
  interest: string;
  costs: string;
}

export interface YearPosition {
  ticker: string;
  instrumentName: string | null;
  costBasis: string;
  /** Percent of all money in open positions at the end of the year. */
  share: string;
}

export interface YearMove {
  ticker: string;
  instrumentName: string | null;
  realisedPnl: string;
  returnPct: string | null;
  days: number | null;
}

export interface YearReview {
  year: number;
  /** The year has not ended: figures are to date. */
  partial: boolean;
  totals: YearTotals;
  previous: YearTotals | null;
  portfolio: {
    investedStart: string;
    investedEnd: string;
    positionsStart: number;
    positionsEnd: number;
    opened: number;
    closed: number;
    top: YearPosition[];
  };
  bestPosition: YearMove | null;
  worstPosition: YearMove | null;
  bestInstrument: YearMove | null;
  worstInstrument: YearMove | null;
  habits: {
    months: { month: string; buys: number; sells: number }[];
    busiestMonth: { month: string; trades: number } | null;
    averageHoldingDays: number | null;
    /** Percent of positions closed this year that were held a week or less. */
    quickShare: string | null;
    winRate: string | null;
    closedPositions: number;
  };
  dividends: {
    net: string;
    withheld: string;
    payers: number;
    top: { ticker: string; instrumentName: string | null; net: string } | null;
  };
  costs: Omit<CostYear, 'year' | 'purchases' | 'realisedPnl'>;
}

const ZERO = new Decimal(0);
const TOP_POSITIONS = 5;
const COST_FIELDS = [
  'currencyConversion',
  'transactionTaxes',
  'depositFees',
  'otherFees',
  'dividendTaxLost',
  'total',
] as const;

export function yearsWithActivity(
  histories: AccountHistory[],
  timeZone = DEFAULT_TAX_TIME_ZONE,
): number[] {
  const yearOf = taxYearOf(timeZone);
  const years = new Set<number>();
  for (const h of histories)
    for (const e of h.entries) years.add(yearOf(e.occurredAt));
  return [...years].sort((a, b) => b - a);
}

export function buildYearReview(
  year: number,
  histories: AccountHistory[],
  options: { now?: Date; timeZone?: string } = {},
): YearReview {
  const timeZone = options.timeZone ?? DEFAULT_TAX_TIME_ZONE;
  const yearOf = taxYearOf(timeZone);
  const monthOf = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
    })
      .format(d)
      .slice(0, 7);
  const now = options.now ?? new Date();

  const engines = histories.map((h) => ({
    h,
    engine: computeCostBasis(h.entries, 'AVERAGE', timeZone),
    insights: buildInsights(h.entries, h.dividends, h.charges, {
      now,
      timeZone,
    }),
  }));

  const totalsFor = (y: number): YearTotals | null => {
    const sum = (pick: (t: Record<string, string>) => string) =>
      engines
        .map(({ engine }) => engine.years.find((t) => t.year === y))
        .filter((t) => t !== undefined)
        .reduce(
          (s, t) => s.plus(pick(t as unknown as Record<string, string>)),
          ZERO,
        );
    const any = engines.some(({ engine }) =>
      engine.years.some((t) => t.year === y),
    );
    if (!any) return null;
    const count = (kind: string) =>
      histories.reduce(
        (n, h) =>
          n +
          h.entries.filter((e) => e.kind === kind && yearOf(e.occurredAt) === y)
            .length,
        0,
      );
    const costs = engines.reduce(
      (s, { insights }) =>
        s.plus(insights.costs.years.find((c) => c.year === y)?.total ?? 0),
      ZERO,
    );
    return {
      deposits: sum((t) => t.deposits).toFixed(2),
      withdrawals: sum((t) => t.withdrawals).toFixed(2),
      purchases: sum((t) => t.purchases).toFixed(2),
      buys: count('BUY'),
      saleProceeds: sum((t) => t.saleProceeds).toFixed(2),
      sells: count('SELL'),
      realisedPnl: sum((t) => t.realisedPnl).toFixed(2),
      dividends: sum((t) => t.dividends).toFixed(2),
      interest: sum((t) => t.interest).toFixed(2),
      costs: costs.toFixed(2),
    };
  };

  const empty: YearTotals = {
    deposits: '0.00',
    withdrawals: '0.00',
    purchases: '0.00',
    buys: 0,
    saleProceeds: '0.00',
    sells: 0,
    realisedPnl: '0.00',
    dividends: '0.00',
    interest: '0.00',
    costs: '0.00',
  };

  // ── Portfolio at the start and end of the year ─────────────────────────────
  const holdingsAt = (y: number): Holding[] =>
    engines.flatMap(({ engine }) => {
      const t = engine.years.find((x) => x.year === y);
      if (t) return t.holdingsAtYearEnd;
      // No activity that year: whatever was held at the end of the last year before it.
      const before = engine.years.filter((x) => x.year < y).at(-1);
      return before?.holdingsAtYearEnd ?? [];
    });
  const start = holdingsAt(year - 1);
  const end = holdingsAt(year);
  const invested = (list: Holding[]) =>
    list.reduce((s, h) => s.plus(h.costBasis), ZERO);
  const investedEnd = invested(end);
  const byInstrument = new Map<
    string,
    { ticker: string; name: string | null; cost: Decimal }
  >();
  for (const h of end) {
    const key = h.isin ?? h.ticker;
    const r = byInstrument.get(key) ?? {
      ticker: h.ticker,
      name: h.instrumentName,
      cost: ZERO,
    };
    r.cost = r.cost.plus(h.costBasis);
    byInstrument.set(key, r);
  }
  const top = [...byInstrument.values()]
    .sort((a, b) => b.cost.comparedTo(a.cost))
    .slice(0, TOP_POSITIONS)
    .map((r) => ({
      ticker: r.ticker,
      instrumentName: r.name,
      costBasis: r.cost.toFixed(2),
      share: investedEnd.gt(0)
        ? r.cost.div(investedEnd).times(100).toFixed(1)
        : '0.0',
    }));

  let opened = 0;
  let closed = 0;
  for (const { engine } of engines) {
    const held = new Map<string, Decimal>();
    const events = [...engine.positionEvents].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    for (const e of events) {
      const key = e.isin ?? e.ticker;
      const before = held.get(key) ?? ZERO;
      const after = new Decimal(e.positionQuantity);
      held.set(key, after);
      if (yearOf(e.date) !== year) continue;
      if (e.kind === 'BUY' && before.lte(0) && after.gt(0)) opened++;
      if (e.kind === 'SELL' && before.gt(0) && after.lte(0)) closed++;
    }
  }

  // ── Best and worst ─────────────────────────────────────────────────────────
  const cycles: HoldingCycle[] = engines
    .flatMap(({ insights }) => insights.holding.cycles)
    .filter((c) => yearOf(c.closed) === year);
  const move = (c: HoldingCycle | undefined): YearMove | null =>
    c
      ? {
          ticker: c.ticker,
          instrumentName: c.instrumentName,
          realisedPnl: c.realisedPnl,
          returnPct: c.returnPct,
          days: c.days,
        }
      : null;
  const byPnl = [...cycles].sort(
    (a, b) => Number(b.realisedPnl) - Number(a.realisedPnl),
  );
  const best =
    byPnl[0] && Number(byPnl[0].realisedPnl) > 0 ? byPnl[0] : undefined;
  const worstCycle = byPnl.at(-1);
  const worst =
    worstCycle && Number(worstCycle.realisedPnl) < 0 ? worstCycle : undefined;

  const instrumentPnl = new Map<string, YearMove & { pnl: Decimal }>();
  for (const { engine } of engines)
    for (const s of engine.sales) {
      if (yearOf(s.date) !== year) continue;
      const key = s.isin ?? s.ticker;
      const r = instrumentPnl.get(key) ?? {
        ticker: s.ticker,
        instrumentName: s.instrumentName,
        realisedPnl: '0',
        returnPct: null,
        days: null,
        pnl: ZERO,
      };
      r.pnl = r.pnl.plus(s.realisedPnl);
      instrumentPnl.set(key, r);
    }
  const instruments = [...instrumentPnl.values()]
    .map(({ pnl, ...r }) => ({ ...r, realisedPnl: pnl.toFixed(2) }))
    .sort((a, b) => Number(b.realisedPnl) - Number(a.realisedPnl));
  const bestInstrument =
    instruments[0] && Number(instruments[0].realisedPnl) > 0
      ? instruments[0]
      : null;
  const lastInstrument = instruments.at(-1);
  const worstInstrument =
    lastInstrument && Number(lastInstrument.realisedPnl) < 0
      ? lastInstrument
      : null;

  // ── Habits ─────────────────────────────────────────────────────────────────
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, '0')}`,
    buys: 0,
    sells: 0,
  }));
  for (const h of histories)
    for (const e of h.entries) {
      if (e.kind !== 'BUY' && e.kind !== 'SELL') continue;
      const m = months.find((x) => x.month === monthOf(e.occurredAt));
      if (!m) continue;
      if (e.kind === 'BUY') m.buys++;
      else m.sells++;
    }
  const busiest = months.reduce<(typeof months)[number] | null>(
    (b, m) => (m.buys + m.sells > (b ? b.buys + b.sells : 0) ? m : b),
    null,
  );
  const wins = cycles.filter((c) => Number(c.realisedPnl) > 0).length;

  // ── Dividends ──────────────────────────────────────────────────────────────
  // Refunds of withheld tax count in what was received and withheld, not as a payer.
  const inYear = histories
    .flatMap((h) => h.dividends)
    .filter((d) => yearOf(d.date) === year);
  const paid = inYear.filter((d) => d.source !== 'adjustment');
  const byPayer = new Map<
    string,
    { ticker: string; instrumentName: string | null; net: Decimal }
  >();
  for (const d of paid) {
    const key = d.isin ?? d.ticker;
    const r = byPayer.get(key) ?? {
      ticker: d.ticker,
      instrumentName: d.instrumentName,
      net: ZERO,
    };
    r.net = r.net.plus(d.net);
    byPayer.set(key, r);
  }
  const topPayer = [...byPayer.values()].sort((a, b) =>
    b.net.comparedTo(a.net),
  )[0];

  // ── Costs ──────────────────────────────────────────────────────────────────
  const costs = Object.fromEntries(
    COST_FIELDS.map((f) => [
      f,
      engines
        .reduce(
          (s, { insights }) =>
            s.plus(insights.costs.years.find((c) => c.year === year)?.[f] ?? 0),
          ZERO,
        )
        .toFixed(2),
    ]),
  ) as YearReview['costs'];

  return {
    year,
    partial: year >= yearOf(now),
    totals: totalsFor(year) ?? empty,
    previous: totalsFor(year - 1),
    portfolio: {
      investedStart: invested(start).toFixed(2),
      investedEnd: investedEnd.toFixed(2),
      positionsStart: new Set(start.map((h) => h.isin ?? h.ticker)).size,
      positionsEnd: byInstrument.size,
      opened,
      closed,
      top,
    },
    bestPosition: move(best),
    worstPosition: move(worst),
    bestInstrument,
    worstInstrument,
    habits: {
      months,
      busiestMonth:
        busiest && busiest.buys + busiest.sells > 0
          ? { month: busiest.month, trades: busiest.buys + busiest.sells }
          : null,
      averageHoldingDays: cycles.length
        ? Math.round(cycles.reduce((s, c) => s + c.days, 0) / cycles.length)
        : null,
      quickShare: cycles.length
        ? (
            (cycles.filter((c) => c.days <= 7).length / cycles.length) *
            100
          ).toFixed(0)
        : null,
      winRate: cycles.length ? ((wins / cycles.length) * 100).toFixed(0) : null,
      closedPositions: cycles.length,
    },
    dividends: {
      net: inYear.reduce((s, d) => s.plus(d.net), ZERO).toFixed(2),
      withheld: inYear
        .reduce((s, d) => s.plus(d.withheld ?? 0), ZERO)
        .toFixed(2),
      payers: byPayer.size,
      top: topPayer
        ? {
            ticker: topPayer.ticker,
            instrumentName: topPayer.instrumentName,
            net: topPayer.net.toFixed(2),
          }
        : null,
    },
    costs,
  };
}
