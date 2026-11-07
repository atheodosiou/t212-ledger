import { Decimal } from 'decimal.js';
import type { EngineEntry, EngineResult } from '../ledger/cost-basis.js';
import type { T212AccountSummary, T212Position } from '../trading212/t212.types.js';

export interface LivePosition {
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  quantity: string;
  /** Instrument currency. */
  currentPrice: string;
  instrumentCurrency: string | null;
  /** Account currency. */
  value: string;
  /** Account currency, buy fees included (our cost basis). */
  cost: string;
  result: string;
  /** Percent of cost. */
  resultPct: string | null;
  /** Percent of invested value. */
  weightPct: string;
  /** Part of the result that comes from exchange-rate moves, per Trading 212. */
  fxImpact: string | null;
}

export interface BreakdownLine {
  key: 'realised' | 'unrealised' | 'dividends' | 'interest' | 'fees' | 'other';
  amount: string;
}

export interface PortfolioView {
  asOf: Date;
  currency: string;
  totalValue: string;
  investedValue: string;
  cash: string;
  /** Deposits minus withdrawals, all time. */
  netDeposits: string;
  /** totalValue − netDeposits. */
  totalResult: string;
  totalResultPct: string | null;
  /** Where the total result comes from; sums to `breakdownTotal`. */
  breakdown: BreakdownLine[];
  breakdownTotal: string;
  /** totalResult − breakdownTotal. Near zero when history and live data agree. */
  unexplained: string;
  positions: LivePosition[];
}

const d = (v: number | string | undefined | null) => new Decimal(v ?? 0);

/**
 * Combines live account data from Trading 212 with the replayed ledger.
 *
 * Total result = what the account is worth now − what was put in. It splits into
 * closed trades (realised), open positions (value − our cost), dividends, interest,
 * standalone fees (e.g. deposit fees) and anything else that moved cash.
 */
export function buildPortfolioView(input: {
  summary: T212AccountSummary;
  positions: T212Position[];
  engine: Pick<EngineResult, 'holdings' | 'sales'>;
  entries: Pick<EngineEntry, 'kind' | 'cashAmount'>[];
  displayTickers: Map<string, string>;
  currency: string;
  asOf: Date;
}): PortfolioView {
  const { summary, positions, engine, entries } = input;

  const sumCash = (kinds: string[]) =>
    entries.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s.plus(e.cashAmount), new Decimal(0));

  const netDeposits = sumCash(['DEPOSIT', 'WITHDRAWAL']);
  const totalValue = d(summary.totalValue);
  const cash = d(summary.cash?.availableToTrade).plus(d(summary.cash?.reservedForOrders)).plus(d(summary.cash?.inPies));
  const investedValue = positions.reduce((s, p) => s.plus(p.walletImpact.currentValue), new Decimal(0));

  const costByIsin = new Map(engine.holdings.map((h) => [h.isin ?? h.ticker, d(h.costBasis)]));
  const live = positions.map((p) => {
    const value = d(p.walletImpact.currentValue);
    // Prefer our cost (fees included); fall back to Trading 212's when the history lacks the position.
    const cost = costByIsin.get(p.instrument.isin) ?? d(p.walletImpact.totalCost);
    const result = value.minus(cost);
    return {
      ticker: input.displayTickers.get(p.instrument.ticker) ?? p.instrument.ticker.split('_')[0],
      isin: p.instrument.isin ?? null,
      instrumentName: p.instrument.name ?? null,
      quantity: d(p.quantity).toFixed(),
      currentPrice: d(p.currentPrice).toFixed(),
      instrumentCurrency: p.instrument.currency ?? null,
      value: value.toFixed(2),
      cost: cost.toFixed(2),
      result: result.toFixed(2),
      resultPct: cost.gt(0) ? result.div(cost).times(100).toFixed(1) : null,
      weightPct: investedValue.gt(0) ? value.div(investedValue).times(100).toFixed(1) : '0.0',
      fxImpact: p.walletImpact.fxImpact != null ? d(p.walletImpact.fxImpact).toFixed(2) : null,
    };
  });
  live.sort((a, b) => Number(b.value) - Number(a.value));

  const realised = engine.sales.reduce((s, x) => s.plus(x.realisedPnl), new Decimal(0));
  const unrealised = live.reduce((s, p) => s.plus(p.result), new Decimal(0));
  const lines: BreakdownLine[] = [
    { key: 'realised', amount: realised.toFixed(2) },
    { key: 'unrealised', amount: unrealised.toFixed(2) },
    { key: 'dividends', amount: sumCash(['DIVIDEND']).toFixed(2) },
    { key: 'interest', amount: sumCash(['INTEREST']).toFixed(2) },
    { key: 'fees', amount: sumCash(['FEE']).toFixed(2) },
    { key: 'other', amount: sumCash(['OTHER']).toFixed(2) },
  ];
  const breakdown = lines.filter((l) => l.key !== 'other' || !d(l.amount).isZero());
  const breakdownTotal = breakdown.reduce((s, l) => s.plus(l.amount), new Decimal(0));
  const totalResult = totalValue.minus(netDeposits);

  return {
    asOf: input.asOf,
    currency: input.currency,
    totalValue: totalValue.toFixed(2),
    investedValue: investedValue.toFixed(2),
    cash: cash.toFixed(2),
    netDeposits: netDeposits.toFixed(2),
    totalResult: totalResult.toFixed(2),
    totalResultPct: netDeposits.gt(0) ? totalResult.div(netDeposits).times(100).toFixed(1) : null,
    breakdown,
    breakdownTotal: breakdownTotal.toFixed(2),
    unexplained: totalResult.minus(breakdownTotal).toFixed(2),
    positions: live,
  };
}
