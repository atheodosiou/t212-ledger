import { Decimal } from 'decimal.js';
import type { LedgerKind } from './normalize.js';

export type CostMethod = 'AVERAGE' | 'FIFO';

/** The subset of a ledger entry the engine needs. Numeric fields are decimal strings. */
export interface EngineEntry {
  id: string;
  occurredAt: Date;
  kind: LedgerKind;
  sourceType: string;
  ticker: string | null;
  /** Market ticker (e.g. ASTS for NPA_US_EQ); preferred in output when present. */
  displayTicker?: string | null;
  isin: string | null;
  instrumentName: string | null;
  quantity: string | null;
  cashAmount: string;
  fees: string;
  brokerRealisedPnl: string | null;
}

export interface RealisedSale {
  entryId: string;
  date: Date;
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  quantity: string;
  /** Net proceeds received, account currency (after sell fees). */
  proceeds: string;
  /** Cost of the shares sold, account currency (buy fees included). */
  costBasis: string;
  realisedPnl: string;
  sellFees: string;
  brokerRealisedPnl: string | null;
  /** Shares sold that had no matching purchase in the history (e.g. transferred in). */
  unmatchedQuantity: string;
}

export interface Holding {
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  quantity: string;
  costBasis: string;
  averageCost: string;
}

type Totals = {
  /** Amounts credited to the account, as Trading 212 reports them (after deposit fees). */
  deposits: string;
  /** Fees on card deposits (Trading 212's "Deposit fee"), positive. */
  depositFees: string;
  withdrawals: string;
  purchases: string;
  saleProceeds: string;
  realisedPnl: string;
  /** Trading 212's own realised result of the sales (fees not deducted). */
  brokerRealisedPnl: string;
  dividends: string;
  interest: string;
  /** Trading fees (inside BUY/SELL) plus standalone fees other than deposit fees. */
  fees: string;
};

/**
 * Deposit fees: the API sends a card deposit as the amount charged (DEPOSIT, e.g.
 * 1007) and the fee (FEE, -7) at the same instant, where Trading 212 itself reports a
 * deposit of 1000 with a deposit fee of 7. Returns the ids of those FEE entries.
 */
export function depositFeeIds(
  entries: { id: string; kind: string; occurredAt: Date }[],
): Set<string> {
  const depositTimes = new Set(
    entries
      .filter((e) => e.kind === 'DEPOSIT')
      .map((e) => e.occurredAt.getTime()),
  );
  return new Set(
    entries
      .filter(
        (e) => e.kind === 'FEE' && depositTimes.has(e.occurredAt.getTime()),
      )
      .map((e) => e.id),
  );
}

export interface YearSummary extends Totals {
  year: number;
  /** Holdings at 31 Dec of that year (or now, for the current year). */
  holdingsAtYearEnd: Holding[];
}

export interface EngineWarning {
  entryId: string;
  date: Date;
  message: string;
}

/** State of one position right after a trade or corporate action, for timelines. */
export interface PositionEvent {
  entryId: string;
  date: Date;
  kind: 'BUY' | 'SELL' | 'CORPORATE_ACTION';
  sourceType: string;
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  /** Shares bought (+) or sold (-). */
  quantity: string;
  /** Account currency per share, fees included; null for corporate actions. */
  pricePerShare: string | null;
  positionQuantity: string;
  /** Account currency per share after the event; null when the position is closed. */
  averageCost: string | null;
  realisedPnl: string | null;
}

export interface EngineResult {
  method: CostMethod;
  sales: RealisedSale[];
  holdings: Holding[];
  years: YearSummary[];
  warnings: EngineWarning[];
  positionEvents: PositionEvent[];
}

interface Lot {
  quantity: Decimal;
  cost: Decimal;
}

interface Position {
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  lots: Lot[];
}

/** Tax years follow the taxpayer's local calendar, not UTC. */
export const DEFAULT_TAX_TIME_ZONE = 'Europe/Athens';

export function taxYearOf(timeZone: string): (date: Date) => number {
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
  });
  return (date) => Number(format.format(date));
}

const ZERO = new Decimal(0);
const EPS = new Decimal('1e-9');

const emptyTotals = (): Totals => ({
  deposits: '0',
  depositFees: '0',
  withdrawals: '0',
  purchases: '0',
  saleProceeds: '0',
  realisedPnl: '0',
  brokerRealisedPnl: '0',
  dividends: '0',
  interest: '0',
  fees: '0',
});

/**
 * Replays the ledger in time order and computes realised P&L per sale, holdings,
 * and per-year totals in the account currency.
 *
 * AVERAGE keeps a single pooled lot per instrument (what Trading 212 shows).
 * FIFO consumes the oldest lots first.
 */
export function computeCostBasis(
  entries: EngineEntry[],
  method: CostMethod,
  timeZone: string = DEFAULT_TAX_TIME_ZONE,
): EngineResult {
  const yearOf = taxYearOf(timeZone);
  const sorted = [...entries].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );
  const depositFees = depositFeeIds(sorted);
  const positions = new Map<string, Position>();
  const sales: RealisedSale[] = [];
  const warnings: EngineWarning[] = [];
  const totals = new Map<number, Totals>();
  const yearEndHoldings = new Map<number, Holding[]>();
  let currentYear: number | null = null;

  const add = (year: number, field: keyof Totals, value: Decimal) => {
    const t = totals.get(year)!;
    t[field] = new Decimal(t[field]).plus(value).toFixed();
  };
  const warn = (entry: EngineEntry, message: string) =>
    warnings.push({ entryId: entry.id, date: entry.occurredAt, message });
  const positionEvents: PositionEvent[] = [];
  const record = (
    entry: EngineEntry,
    pos: Position,
    quantity: Decimal,
    realisedPnl: Decimal | null,
  ) => {
    const held = pos.lots.reduce((s, l) => s.plus(l.quantity), ZERO);
    const cost = pos.lots.reduce((s, l) => s.plus(l.cost), ZERO);
    positionEvents.push({
      entryId: entry.id,
      date: entry.occurredAt,
      kind: entry.kind as PositionEvent['kind'],
      sourceType: entry.sourceType,
      ticker: pos.ticker,
      isin: pos.isin,
      instrumentName: pos.instrumentName,
      quantity: quantity.toFixed(),
      pricePerShare:
        entry.kind === 'CORPORATE_ACTION' || quantity.isZero()
          ? null
          : new Decimal(entry.cashAmount).abs().div(quantity.abs()).toFixed(4),
      positionQuantity: held.lte(EPS) ? '0' : held.toFixed(),
      averageCost: held.lte(EPS) ? null : cost.div(held).toFixed(4),
      realisedPnl: realisedPnl ? realisedPnl.toFixed(2) : null,
    });
  };

  for (const entry of sorted) {
    const year = yearOf(entry.occurredAt);
    if (currentYear !== null && year !== currentYear) {
      // Snapshot holdings for every year we leave, including years with no activity.
      for (let y = currentYear; y < year; y++) {
        yearEndHoldings.set(y, snapshot(positions));
        if (!totals.has(y)) totals.set(y, emptyTotals());
      }
    }
    currentYear = year;
    if (!totals.has(year)) totals.set(year, emptyTotals());

    const cash = new Decimal(entry.cashAmount);
    const fees = new Decimal(entry.fees);

    switch (entry.kind) {
      case 'DEPOSIT':
        add(year, 'deposits', cash);
        break;
      case 'WITHDRAWAL':
        add(year, 'withdrawals', cash.abs());
        break;
      case 'INTEREST':
        add(year, 'interest', cash);
        break;
      case 'DIVIDEND':
        add(year, 'dividends', cash);
        break;
      case 'FEE':
        if (depositFees.has(entry.id)) {
          // Report the deposit net, as Trading 212 does, and its fee apart.
          add(year, 'deposits', cash);
          add(year, 'depositFees', cash.abs());
        } else add(year, 'fees', fees);
        break;
      case 'BUY': {
        const pos = position(positions, entry);
        const quantity = new Decimal(entry.quantity ?? 0).abs();
        const cost = cash.abs();
        if (method === 'AVERAGE' && pos.lots.length > 0) {
          const pool = pos.lots[0];
          pos.lots[0] = {
            quantity: pool.quantity.plus(quantity),
            cost: pool.cost.plus(cost),
          };
        } else {
          pos.lots.push({ quantity, cost });
        }
        add(year, 'purchases', cost);
        add(year, 'fees', fees);
        record(entry, pos, quantity, null);
        break;
      }
      case 'SELL': {
        const pos = position(positions, entry);
        const quantity = new Decimal(entry.quantity ?? 0).abs();
        const { cost, unmatched } = consume(pos, quantity);
        if (unmatched.gt(EPS)) {
          warn(
            entry,
            `${pos.ticker}: sold ${unmatched.toFixed()} more shares than the history shows were bought`,
          );
        }
        const proceeds = cash.abs();
        // Per-sale figures are rounded to cents, and the yearly total is the sum of those rounded figures,
        // so the report adds up line by line exactly as an accountant would check it.
        const pnl = proceeds.minus(cost.toDecimalPlaces(2));
        sales.push({
          entryId: entry.id,
          date: entry.occurredAt,
          ticker: pos.ticker,
          isin: pos.isin,
          instrumentName: pos.instrumentName,
          quantity: quantity.toFixed(),
          proceeds: proceeds.toFixed(2),
          costBasis: cost.toFixed(2),
          realisedPnl: pnl.toFixed(2),
          sellFees: fees.toFixed(),
          brokerRealisedPnl: entry.brokerRealisedPnl,
          unmatchedQuantity: unmatched.toFixed(),
        });
        add(year, 'saleProceeds', proceeds);
        add(year, 'realisedPnl', pnl);
        if (entry.brokerRealisedPnl !== null)
          add(year, 'brokerRealisedPnl', new Decimal(entry.brokerRealisedPnl));
        add(year, 'fees', fees);
        record(entry, pos, quantity.neg(), pnl);
        break;
      }
      case 'CORPORATE_ACTION': {
        const pos = position(positions, entry);
        const delta = new Decimal(entry.quantity ?? 0);
        const held = pos.lots.reduce((s, l) => s.plus(l.quantity), ZERO);
        if (entry.sourceType === 'STOCK_SPLIT' && held.gt(EPS)) {
          // Same total cost spread over more (or fewer) shares: scale every lot.
          const factor = held.plus(delta).div(held);
          pos.lots = pos.lots.map((l) => ({
            quantity: l.quantity.times(factor),
            cost: l.cost,
          }));
        } else if (delta.gt(0)) {
          pos.lots.push({ quantity: delta, cost: ZERO });
          warn(
            entry,
            `${pos.ticker}: ${entry.sourceType} added ${delta.toFixed()} shares at zero cost; review`,
          );
        } else if (delta.lt(0)) {
          consume(pos, delta.abs());
          warn(
            entry,
            `${pos.ticker}: ${entry.sourceType} removed ${delta.abs().toFixed()} shares; review`,
          );
        }
        record(entry, pos, delta, null);
        break;
      }
      case 'TRANSFER':
      case 'OTHER':
        break;
    }
  }

  if (currentYear !== null)
    yearEndHoldings.set(currentYear, snapshot(positions));

  return {
    method,
    sales,
    holdings: snapshot(positions),
    years: [...totals.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, t]) => ({
        year,
        ...t,
        holdingsAtYearEnd: yearEndHoldings.get(year) ?? [],
      })),
    warnings,
    positionEvents,
  };
}

function position(
  positions: Map<string, Position>,
  entry: EngineEntry,
): Position {
  const key = entry.isin ?? entry.ticker ?? 'UNKNOWN';
  const ticker = entry.displayTicker ?? entry.ticker ?? key;
  let pos = positions.get(key);
  if (!pos) {
    pos = {
      ticker,
      isin: entry.isin,
      instrumentName: entry.instrumentName,
      lots: [],
    };
    positions.set(key, pos);
  } else {
    // Latest names win, so a renamed company shows under its current ticker.
    pos.ticker = ticker;
    if (entry.instrumentName) pos.instrumentName = entry.instrumentName;
  }
  return pos;
}

/** Removes `quantity` shares from the front of the lot queue and returns their cost. */
function consume(
  pos: Position,
  quantity: Decimal,
): { cost: Decimal; unmatched: Decimal } {
  let remaining = quantity;
  let cost = ZERO;
  while (remaining.gt(EPS) && pos.lots.length > 0) {
    const lot = pos.lots[0];
    const take = Decimal.min(lot.quantity, remaining);
    const takeCost = lot.quantity.isZero()
      ? ZERO
      : lot.cost.times(take).div(lot.quantity);
    cost = cost.plus(takeCost);
    lot.quantity = lot.quantity.minus(take);
    lot.cost = lot.cost.minus(takeCost);
    remaining = remaining.minus(take);
    if (lot.quantity.lte(EPS)) pos.lots.shift();
  }
  return { cost, unmatched: remaining.gt(EPS) ? remaining : ZERO };
}

function snapshot(positions: Map<string, Position>): Holding[] {
  const out: Holding[] = [];
  for (const pos of positions.values()) {
    const quantity = pos.lots.reduce((s, l) => s.plus(l.quantity), ZERO);
    if (quantity.lte(EPS)) continue;
    const cost = pos.lots.reduce((s, l) => s.plus(l.cost), ZERO);
    out.push({
      ticker: pos.ticker,
      isin: pos.isin,
      instrumentName: pos.instrumentName,
      quantity: quantity.toFixed(),
      costBasis: cost.toFixed(2),
      averageCost: cost.div(quantity).toFixed(6),
    });
  }
  return out.sort((a, b) => a.ticker.localeCompare(b.ticker));
}
