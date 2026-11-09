import type { DividendDetail } from './dividends.js';
import { bucketOf, buildInsights, type InsightsEntry } from './insights.js';

let seq = 0;
const US = {
  ticker: 'KO_US_EQ',
  isin: 'US1912161007',
  instrumentName: 'Coca-Cola',
  instrumentCurrency: 'USD',
};
const IE = {
  ticker: 'VWCEd_EQ',
  isin: 'IE00BK5BQT80',
  instrumentName: 'Vanguard FTSE All-World',
  instrumentCurrency: 'EUR',
};

function e(
  partial: Partial<InsightsEntry> & Pick<InsightsEntry, 'kind' | 'occurredAt'>,
): InsightsEntry {
  return {
    id: `e${++seq}`,
    sourceType: partial.kind,
    ticker: null,
    isin: null,
    instrumentName: null,
    instrumentCurrency: null,
    quantity: null,
    cashAmount: '0',
    fees: '0',
    brokerRealisedPnl: null,
    ...partial,
  };
}
const at = (iso: string) => new Date(iso);

const buyKo = e({
  kind: 'BUY',
  occurredAt: at('2025-01-10T10:00:00Z'),
  quantity: '10',
  cashAmount: '-100.15',
  fees: '0.15',
  ...US,
});
const sellKo = e({
  kind: 'SELL',
  occurredAt: at('2025-01-13T10:00:00Z'),
  quantity: '-10',
  cashAmount: '119.85',
  fees: '0.15',
  ...US,
});
const buyKo2 = e({
  kind: 'BUY',
  occurredAt: at('2025-03-01T10:00:00Z'),
  quantity: '5',
  cashAmount: '-60',
  ...US,
});
const sellKo2 = e({
  kind: 'SELL',
  occurredAt: at('2025-09-01T10:00:00Z'),
  quantity: '-5',
  cashAmount: '50',
  ...US,
});
const buyVwce = e({
  kind: 'BUY',
  occurredAt: at('2025-02-01T10:00:00Z'),
  quantity: '2',
  cashAmount: '-200',
  ...IE,
});
const deposit = e({
  kind: 'DEPOSIT',
  occurredAt: at('2025-01-05T10:00:00Z'),
  cashAmount: '1007',
});
const depositFee = e({
  kind: 'FEE',
  occurredAt: at('2025-01-05T10:00:00Z'),
  cashAmount: '-7',
  fees: '7',
});
const ledger = [deposit, depositFee, buyKo, sellKo, buyVwce, buyKo2, sellKo2];

const charges = new Map([
  [buyKo.id, [{ name: 'CURRENCY_CONVERSION_FEE', amount: '-0.15' }]],
  [sellKo.id, [{ name: 'CURRENCY_CONVERSION_FEE', amount: '-0.15' }]],
]);

const dividend = (
  gross: string,
  withheld: string,
  source: DividendDetail['source'] = 'export',
) =>
  ({
    entryId: `d${++seq}`,
    date: at('2025-06-01T10:00:00Z'),
    ticker: 'KO',
    isin: US.isin,
    instrumentName: 'Coca-Cola',
    shares: '1',
    grossInstrument: null,
    instrumentCurrency: 'USD',
    net: '0',
    fxRate: null,
    grossAccount: gross,
    withheld,
    withheldOriginal: null,
    withheldCurrency: null,
    withholdingRate: null,
    source,
    estimated: false,
    note: null,
  }) satisfies DividendDetail;

describe('buildInsights', () => {
  const insights = buildInsights(
    ledger,
    [dividend('10.00', '3.00'), dividend('0', '-0.50', 'adjustment')],
    charges,
    { now: at('2025-10-15T10:00:00Z') },
  );

  it('measures every position from its first buy to the sale that empties it', () => {
    expect(
      insights.holding.cycles.map((c) => [
        c.ticker,
        c.days,
        c.invested,
        c.realisedPnl,
        c.returnPct,
      ]),
    ).toEqual([
      ['KO_US_EQ', 3, '100.15', '19.70', '19.7'],
      ['KO_US_EQ', 184, '60.00', '-10.00', '-16.7'],
    ]);
    expect(insights.holding.buckets.find((b) => b.key === 'WEEK')).toEqual({
      key: 'WEEK',
      positions: 1,
      wins: 1,
      realisedPnl: '19.70',
    });
    expect(bucketOf(0.2)).toBe('DAY');
    expect(bucketOf(400)).toBe('LONGER');
  });

  it('adds up results per instrument and over closed positions', () => {
    expect(insights.results.instruments).toEqual([
      expect.objectContaining({
        ticker: 'KO_US_EQ',
        realisedPnl: '9.70',
        sales: 2,
        open: false,
      }),
    ]);
    expect(insights.results).toMatchObject({
      closedPositions: 2,
      wins: 1,
      winRate: '50',
      averageWin: '19.70',
      averageLoss: '-10.00',
      profitFactor: '1.97',
    });
  });

  it('counts what investing cost, including dividend tax beyond the Greek 5%', () => {
    expect(insights.costs.years).toEqual([
      expect.objectContaining({
        year: 2025,
        currencyConversion: '0.30',
        depositFees: '7.00',
        // 3.00 withheld, 0.50 credited against the Greek 5%, then a 0.50 refund.
        dividendTaxLost: '2.00',
        total: '9.30',
        purchases: '360.15',
      }),
    ]);
  });

  it('splits the money in open positions by currency and country', () => {
    expect(insights.exposure.currencies).toEqual([
      { key: 'EUR', invested: '200.00', share: '100.0' },
    ]);
    expect(insights.exposure.countries).toEqual([
      { key: 'IE', invested: '200.00', share: '100.0' },
    ]);
    expect(insights.exposure.currencySeries).toEqual(['EUR', 'USD']);
    const jan = insights.exposure.currencyMonths[0];
    expect(jan).toMatchObject({ month: '2025-01', values: ['0.00', '0.00'] });
    const mar = insights.exposure.currencyMonths.find(
      (m) => m.month === '2025-03',
    )!;
    expect(mar).toMatchObject({ values: ['200.00', '60.00'], positions: 2 });
    expect(insights.exposure.currencyMonths.at(-1)!.month).toBe('2025-10');
  });
});
