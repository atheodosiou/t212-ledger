import { Decimal } from 'decimal.js';
import {
  computeCostBasis,
  DEFAULT_TAX_TIME_ZONE,
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
}

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

  for (const e of entries) {
    const b = bucket(monthOf(e.occurredAt));
    const cash = new Decimal(e.cashAmount);
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
    // Most traded first; ties alphabetically.
    instruments: [...byInstrument.values()].sort(
      (a, b) => b.trades - a.trades || a.ticker.localeCompare(b.ticker),
    ),
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
