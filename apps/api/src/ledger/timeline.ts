import { Decimal } from 'decimal.js';
import {
  computeCostBasis,
  DEFAULT_TAX_TIME_ZONE,
  depositFeeIds,
  type CostMethod,
  type EngineEntry,
  type PositionEvent,
} from './cost-basis.js';

export interface MonthBucket {
  /** YYYY-MM in the tax time zone. */
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
  /** Deposits minus withdrawals since the start, at the end of the month. */
  cumulativeNetDeposits: string;
}

export interface InstrumentTimeline {
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  trades: number;
  currentQuantity: string;
  events: PositionEvent[];
}

export interface Timeline {
  method: CostMethod;
  months: MonthBucket[];
  instruments: InstrumentTimeline[];
  journey: Journey;
}

/** One line of the stacked chart: an instrument, or everything else. */
export interface JourneySeries {
  key: string;
  ticker: string;
  instrumentName: string | null;
}

export interface JourneyMonth {
  month: string;
  /** Money in open positions at the end of the month (cost of the shares held). */
  invested: string;
  /** Per series, in the order of `series`; the last is everything else. */
  values: string[];
  positions: number;
}

export type MilestoneKind =
  'FIRST_DEPOSIT' | 'NEW_POSITION' | 'CLOSED' | 'FIRST_DIVIDEND' | 'WITHDRAWAL';

export interface Milestone {
  kind: MilestoneKind;
  date: Date;
  ticker: string | null;
  isin: string | null;
  instrumentName: string | null;
  /** Deposit or withdrawal amount; cost of the first buy of a position. */
  amount: string | null;
  /** Result of a position from opening to closing (closed positions). */
  realisedPnl: string | null;
  /** The position had been held before and closed. */
  again: boolean;
}

export interface Journey {
  series: JourneySeries[];
  months: JourneyMonth[];
  milestones: Milestone[];
}

/** Instruments drawn on their own; the rest are summed as one. */
export const JOURNEY_SERIES = 7;

type MoneyField =
  | 'deposits'
  | 'withdrawals'
  | 'purchases'
  | 'saleProceeds'
  | 'realisedPnl'
  | 'dividends'
  | 'interest'
  | 'fees';

export function buildTimeline(
  entries: EngineEntry[],
  method: CostMethod,
  timeZone: string = DEFAULT_TAX_TIME_ZONE,
): Timeline {
  const engine = computeCostBasis(entries, method, timeZone);
  const monthOf = monthKey(timeZone);

  const buckets = new Map<
    string,
    Record<MoneyField, Decimal> & { buys: number; sells: number }
  >();
  const bucket = (month: string) => {
    let b = buckets.get(month);
    if (!b) {
      const zero = new Decimal(0);
      b = {
        deposits: zero,
        withdrawals: zero,
        purchases: zero,
        saleProceeds: zero,
        realisedPnl: zero,
        dividends: zero,
        interest: zero,
        fees: zero,
        buys: 0,
        sells: 0,
      };
      buckets.set(month, b);
    }
    return b;
  };

  const depositFees = depositFeeIds(entries);
  for (const e of entries) {
    const b = bucket(monthOf(e.occurredAt));
    const cash = new Decimal(e.cashAmount);
    if (depositFees.has(e.id)) {
      // As Trading 212 reports it: the deposit net of its fee.
      b.deposits = b.deposits.plus(cash);
      continue;
    }
    switch (e.kind) {
      case 'DEPOSIT':
        b.deposits = b.deposits.plus(cash);
        break;
      case 'WITHDRAWAL':
        b.withdrawals = b.withdrawals.plus(cash.abs());
        break;
      case 'BUY':
        b.purchases = b.purchases.plus(cash.abs());
        b.fees = b.fees.plus(e.fees);
        b.buys++;
        break;
      case 'SELL':
        b.saleProceeds = b.saleProceeds.plus(cash.abs());
        b.fees = b.fees.plus(e.fees);
        b.sells++;
        break;
      case 'DIVIDEND':
        b.dividends = b.dividends.plus(cash);
        break;
      case 'INTEREST':
        b.interest = b.interest.plus(cash);
        break;
      case 'FEE':
        b.fees = b.fees.plus(e.fees);
        break;
      default:
        break;
    }
  }
  for (const sale of engine.sales) {
    const b = bucket(monthOf(sale.date));
    b.realisedPnl = b.realisedPnl.plus(sale.realisedPnl);
  }

  const months: MonthBucket[] = [];
  let net = new Decimal(0);
  for (const month of fillMonths([...buckets.keys()])) {
    const b = bucket(month);
    net = net.plus(b.deposits).minus(b.withdrawals);
    months.push({
      month,
      deposits: b.deposits.toFixed(2),
      withdrawals: b.withdrawals.toFixed(2),
      purchases: b.purchases.toFixed(2),
      saleProceeds: b.saleProceeds.toFixed(2),
      realisedPnl: b.realisedPnl.toFixed(2),
      dividends: b.dividends.toFixed(2),
      interest: b.interest.toFixed(2),
      fees: b.fees.toFixed(2),
      buys: b.buys,
      sells: b.sells,
      cumulativeNetDeposits: net.toFixed(2),
    });
  }

  const byInstrument = new Map<string, InstrumentTimeline>();
  for (const event of engine.positionEvents) {
    const key = event.isin ?? event.ticker;
    let item = byInstrument.get(key);
    if (!item) {
      item = {
        ticker: event.ticker,
        isin: event.isin,
        instrumentName: event.instrumentName,
        trades: 0,
        currentQuantity: '0',
        events: [],
      };
      byInstrument.set(key, item);
    }
    item.events.push(event);
    if (event.kind !== 'CORPORATE_ACTION') item.trades++;
    item.currentQuantity = event.positionQuantity;
  }

  return {
    method,
    months,
    journey: buildJourney(
      entries,
      engine.positionEvents,
      months.map((m) => m.month),
      monthOf,
    ),
    // Most traded first; ties alphabetically.
    instruments: [...byInstrument.values()].sort(
      (a, b) => b.trades - a.trades || a.ticker.localeCompare(b.ticker),
    ),
  };
}

/**
 * The investment journey: how much money sat in each position at the end of every
 * month (cost of the shares held, so it is exact and needs no market prices), and the
 * moments worth marking: first deposit, every new position, every position closed.
 */
export function buildJourney(
  entries: EngineEntry[],
  events: PositionEvent[],
  monthList: string[],
  monthOf: (date: Date) => string,
): Journey {
  const keyOf = (e: { isin: string | null; ticker: string }) =>
    e.isin ?? e.ticker;
  const names = new Map<
    string,
    { ticker: string; instrumentName: string | null }
  >();
  const cost = new Map<string, Decimal>();
  const peak = new Map<string, Decimal>();
  const snapshots = new Map<string, Map<string, Decimal>>();
  const milestones: Milestone[] = [];
  const everHeld = new Set<string>();
  const periodPnl = new Map<string, Decimal>();

  const sorted = [...events].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  let i = 0;
  for (const month of monthList) {
    for (; i < sorted.length && monthOf(sorted[i].date) <= month; i++) {
      const e = sorted[i];
      const key = keyOf(e);
      names.set(key, { ticker: e.ticker, instrumentName: e.instrumentName });
      const before = cost.get(key) ?? new Decimal(0);
      const held = new Decimal(e.positionQuantity);
      const now =
        e.averageCost && held.gt(0)
          ? held.times(e.averageCost)
          : new Decimal(0);
      cost.set(key, now);
      if (now.gt(peak.get(key) ?? 0)) peak.set(key, now);

      if (e.kind === 'BUY' && before.lte(0)) {
        milestones.push({
          kind: 'NEW_POSITION',
          date: e.date,
          ticker: e.ticker,
          isin: e.isin,
          instrumentName: e.instrumentName,
          amount: now.toFixed(2),
          realisedPnl: null,
          again: everHeld.has(key),
        });
        everHeld.add(key);
        periodPnl.set(key, new Decimal(0));
      }
      if (e.realisedPnl)
        periodPnl.set(
          key,
          (periodPnl.get(key) ?? new Decimal(0)).plus(e.realisedPnl),
        );
      if (e.kind === 'SELL' && held.lte(0) && before.gt(0)) {
        milestones.push({
          kind: 'CLOSED',
          date: e.date,
          ticker: e.ticker,
          isin: e.isin,
          instrumentName: e.instrumentName,
          amount: null,
          realisedPnl: (periodPnl.get(key) ?? new Decimal(0)).toFixed(2),
          again: false,
        });
      }
    }
    snapshots.set(month, new Map(cost));
  }

  const top = [...peak.entries()]
    .sort(([, a], [, b]) => b.comparedTo(a))
    .slice(0, JOURNEY_SERIES)
    .map(([key]) => key);
  const series: JourneySeries[] = [
    ...top.map((key) => ({ key, ...names.get(key)! })),
    { key: 'OTHER', ticker: 'Λοιπά', instrumentName: null },
  ];
  const months: JourneyMonth[] = monthList.map((month) => {
    const snap = snapshots.get(month) ?? new Map<string, Decimal>();
    let total = new Decimal(0);
    let other = new Decimal(0);
    let positions = 0;
    for (const [key, value] of snap) {
      if (value.lte(0)) continue;
      positions++;
      total = total.plus(value);
      if (!top.includes(key)) other = other.plus(value);
    }
    return {
      month,
      invested: total.toFixed(2),
      values: [
        ...top.map((key) => (snap.get(key) ?? new Decimal(0)).toFixed(2)),
        other.toFixed(2),
      ],
      positions,
    };
  });

  const byTime = [...entries].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );
  const firstDeposit = byTime.find((e) => e.kind === 'DEPOSIT');
  if (firstDeposit)
    milestones.push({
      kind: 'FIRST_DEPOSIT',
      date: firstDeposit.occurredAt,
      ticker: null,
      isin: null,
      instrumentName: null,
      amount: new Decimal(firstDeposit.cashAmount).toFixed(2),
      realisedPnl: null,
      again: false,
    });
  const firstDividend = byTime.find(
    (e) => e.kind === 'DIVIDEND' && e.sourceType !== 'DIVIDEND_ADJUSTMENT',
  );
  if (firstDividend)
    milestones.push({
      kind: 'FIRST_DIVIDEND',
      date: firstDividend.occurredAt,
      ticker: firstDividend.displayTicker ?? firstDividend.ticker,
      isin: firstDividend.isin,
      instrumentName: firstDividend.instrumentName,
      amount: new Decimal(firstDividend.cashAmount).toFixed(2),
      realisedPnl: null,
      again: false,
    });
  for (const e of byTime)
    if (e.kind === 'WITHDRAWAL')
      milestones.push({
        kind: 'WITHDRAWAL',
        date: e.occurredAt,
        ticker: null,
        isin: null,
        instrumentName: null,
        amount: new Decimal(e.cashAmount).abs().toFixed(2),
        realisedPnl: null,
        again: false,
      });

  milestones.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { series, months, milestones };
}

function monthKey(timeZone: string): (date: Date) => string {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  });
  return (date) => format.format(date).slice(0, 7);
}

/** Every month from the first to the last key, so gaps show as empty months. */
export function fillMonths(keys: string[]): string[] {
  if (!keys.length) return [];
  const sorted = [...keys].sort();
  const [startY, startM] = sorted[0].split('-').map(Number);
  const [endY, endM] = sorted[sorted.length - 1].split('-').map(Number);
  const out: string[] = [];
  for (
    let y = startY, m = startM;
    y < endY || (y === endY && m <= endM);
    m === 12 ? (y++, (m = 1)) : m++
  ) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}
