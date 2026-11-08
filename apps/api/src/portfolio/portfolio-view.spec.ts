import type { T212Position } from '../trading212/t212.types.js';
import { buildPortfolioView } from './portfolio-view.js';

const position = (
  ticker: string,
  isin: string,
  value: number,
  t212Cost: number,
  extra: Partial<T212Position> = {},
): T212Position => ({
  instrument: { ticker, isin, name: ticker, currency: 'USD' },
  quantity: 10,
  averagePricePaid: 1,
  currentPrice: 6.04,
  walletImpact: {
    currency: 'EUR',
    currentValue: value,
    totalCost: t212Cost,
    unrealizedProfitLoss: value - t212Cost,
    fxImpact: -1.5,
  },
  ...extra,
});

describe('buildPortfolioView', () => {
  // A small account: 1000 in, 10 deposit fee, one closed trade (−50), one open position.
  const entries = [
    { kind: 'DEPOSIT' as const, cashAmount: '1010' },
    { kind: 'FEE' as const, cashAmount: '-10' },
    { kind: 'WITHDRAWAL' as const, cashAmount: '-10' },
    { kind: 'DIVIDEND' as const, cashAmount: '2.5' },
    { kind: 'INTEREST' as const, cashAmount: '0.5' },
    { kind: 'BUY' as const, cashAmount: '-600' },
    { kind: 'SELL' as const, cashAmount: '550' },
    { kind: 'BUY' as const, cashAmount: '-400.60' },
  ];
  // Cash left: 1010 - 10 - 10 + 2.5 + 0.5 - 600 + 550 - 400.60 = 542.40
  const view = buildPortfolioView({
    summary: {
      totalValue: 842.4,
      cash: { availableToTrade: 542.4, reservedForOrders: 0, inPies: 0 },
    },
    positions: [position('NPA_US_EQ', 'US00217D1000', 300, 400)],
    engine: {
      holdings: [
        {
          ticker: 'ASTS',
          isin: 'US00217D1000',
          instrumentName: 'AST',
          quantity: '10',
          costBasis: '400.60',
          averageCost: '40.06',
        },
      ],
      sales: [{ realisedPnl: '-50.00' } as never],
    },
    entries,
    displayTickers: new Map([['NPA_US_EQ', 'ASTS']]),
    currency: 'EUR',
    asOf: new Date('2026-11-08T10:00:00Z'),
  });

  it('measures the total result against what was put in', () => {
    expect(view).toMatchObject({
      netDeposits: '1000.00',
      totalValue: '842.40',
      totalResult: '-157.60',
      totalResultPct: '-15.8',
      cash: '542.40',
    });
  });

  it('explains the total result line by line, with nothing left over', () => {
    expect(view.breakdown).toEqual([
      { key: 'realised', amount: '-50.00' },
      { key: 'unrealised', amount: '-100.60' },
      { key: 'dividends', amount: '2.50' },
      { key: 'interest', amount: '0.50' },
      { key: 'fees', amount: '-10.00' },
    ]);
    expect(view.breakdownTotal).toBe('-157.60');
    expect(view.unexplained).toBe('0.00');
  });

  it('values open positions at our cost basis, under their market ticker', () => {
    expect(view.positions[0]).toMatchObject({
      ticker: 'ASTS',
      value: '300.00',
      cost: '400.60',
      result: '-100.60',
      resultPct: '-25.1',
      weightPct: '100.0',
      fxImpact: '-1.50',
    });
  });

  it("falls back to Trading 212's cost for positions missing from the history", () => {
    const v = buildPortfolioView({
      summary: { totalValue: 100 },
      positions: [position('X_EQ', 'X1', 100, 80)],
      engine: { holdings: [], sales: [] },
      entries: [],
      displayTickers: new Map(),
      currency: 'EUR',
      asOf: new Date(),
    });
    expect(v.positions[0]).toMatchObject({
      ticker: 'X',
      cost: '80.00',
      result: '20.00',
    });
    expect(v.totalResultPct).toBeNull();
  });
});
