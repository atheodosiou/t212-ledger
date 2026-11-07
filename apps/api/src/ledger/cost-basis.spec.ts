import { computeCostBasis, type EngineEntry } from './cost-basis.js';

let seq = 0;
function entry(partial: Partial<EngineEntry> & Pick<EngineEntry, 'kind' | 'occurredAt'>): EngineEntry {
  return {
    id: `e${++seq}`,
    sourceType: partial.kind,
    ticker: null,
    isin: null,
    instrumentName: null,
    quantity: null,
    cashAmount: '0',
    fees: '0',
    brokerRealisedPnl: null,
    ...partial,
  };
}

const at = (iso: string) => new Date(iso);
const stock = { ticker: 'ABC', isin: 'US0000000001', instrumentName: 'ABC Corp' };
const buy = (date: string, quantity: string, cost: string, fees = '0') =>
  entry({ kind: 'BUY', occurredAt: at(date), quantity, cashAmount: `-${cost}`, fees, ...stock });
const sell = (date: string, quantity: string, proceeds: string, fees = '0') =>
  entry({ kind: 'SELL', occurredAt: at(date), quantity: `-${quantity}`, cashAmount: proceeds, fees, ...stock });

describe('computeCostBasis', () => {
  // Bought 10 @ 10, then 10 @ 20, then sold 10 @ 25.
  const ledger = [
    buy('2025-01-10T10:00:00Z', '10', '100'),
    buy('2025-02-10T10:00:00Z', '10', '200'),
    sell('2025-03-10T10:00:00Z', '10', '250', '0.5'),
  ];

  it('uses the pooled average cost with AVERAGE', () => {
    const result = computeCostBasis(ledger, 'AVERAGE');
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0]).toMatchObject({ quantity: '10', proceeds: '250.00', costBasis: '150.00', realisedPnl: '100.00' });
    expect(result.holdings).toEqual([
      expect.objectContaining({ ticker: 'ABC', quantity: '10', costBasis: '150.00', averageCost: '15.000000' }),
    ]);
  });

  it('consumes the oldest lot first with FIFO', () => {
    const result = computeCostBasis(ledger, 'FIFO');
    expect(result.sales[0]).toMatchObject({ costBasis: '100.00', realisedPnl: '150.00' });
    expect(result.holdings[0]).toMatchObject({ quantity: '10', costBasis: '200.00' });
  });

  it('splits a sale across several FIFO lots', () => {
    const result = computeCostBasis(
      [buy('2025-01-01T00:00:00Z', '3', '30'), buy('2025-01-02T00:00:00Z', '3', '60'), sell('2025-01-03T00:00:00Z', '4', '100')],
      'FIFO',
    );
    // 3 shares @ 10 + 1 share @ 20
    expect(result.sales[0].costBasis).toBe('50.00');
  });

  it('handles fractional shares without floating point drift', () => {
    const result = computeCostBasis(
      [
        buy('2025-01-01T00:00:00Z', '0.1', '10.01'),
        buy('2025-01-02T00:00:00Z', '0.2', '20.02'),
        sell('2025-01-03T00:00:00Z', '0.3', '33.33'),
      ],
      'AVERAGE',
    );
    expect(result.sales[0]).toMatchObject({ costBasis: '30.03', realisedPnl: '3.30' });
    expect(result.holdings).toEqual([]);
  });

  it('aggregates cash flows, fees and income per year', () => {
    const result = computeCostBasis(
      [
        entry({ kind: 'DEPOSIT', occurredAt: at('2025-01-01T09:00:00Z'), cashAmount: '201.4' }),
        entry({ kind: 'FEE', occurredAt: at('2025-01-01T09:00:00Z'), cashAmount: '-1.4', fees: '1.4' }),
        buy('2025-01-02T10:00:00Z', '10', '100.07', '0.07'),
        entry({ kind: 'DIVIDEND', occurredAt: at('2025-06-01T00:00:00Z'), cashAmount: '2.5', ...stock }),
        entry({ kind: 'INTEREST', occurredAt: at('2025-06-30T00:00:00Z'), cashAmount: '0.01' }),
        sell('2026-02-01T10:00:00Z', '10', '120', '0.1'),
        entry({ kind: 'WITHDRAWAL', occurredAt: at('2026-03-01T00:00:00Z'), cashAmount: '-50' }),
      ],
      'AVERAGE',
    );

    expect(result.years.map((y) => y.year)).toEqual([2025, 2026]);
    expect(result.years[0]).toMatchObject({
      deposits: '201.4',
      purchases: '100.07',
      dividends: '2.5',
      interest: '0.01',
      fees: '1.47',
      realisedPnl: '0',
    });
    expect(result.years[0].holdingsAtYearEnd).toEqual([expect.objectContaining({ quantity: '10', costBasis: '100.07' })]);
    expect(result.years[1]).toMatchObject({ saleProceeds: '120', realisedPnl: '19.93', withdrawals: '50', fees: '0.1' });
    expect(result.years[1].holdingsAtYearEnd).toEqual([]);
  });

  it('fills in years without any activity', () => {
    const result = computeCostBasis(
      [buy('2023-05-01T00:00:00Z', '1', '10'), sell('2025-05-01T00:00:00Z', '1', '12')],
      'AVERAGE',
    );
    expect(result.years.map((y) => y.year)).toEqual([2023, 2024, 2025]);
    expect(result.years[1].holdingsAtYearEnd).toEqual([expect.objectContaining({ quantity: '1' })]);
  });

  it('sorts input chronologically', () => {
    const result = computeCostBasis([...ledger].reverse(), 'AVERAGE');
    expect(result.sales[0].realisedPnl).toBe('100.00');
  });

  it('warns when more shares are sold than were bought', () => {
    const result = computeCostBasis([buy('2025-01-01T00:00:00Z', '1', '10'), sell('2025-01-02T00:00:00Z', '3', '36')], 'FIFO');
    expect(result.sales[0]).toMatchObject({ costBasis: '10.00', unmatchedQuantity: '2' });
    expect(result.warnings).toHaveLength(1);
  });

  it('keeps total cost through a stock split', () => {
    const result = computeCostBasis(
      [
        buy('2025-01-01T00:00:00Z', '10', '100'),
        entry({ kind: 'CORPORATE_ACTION', sourceType: 'STOCK_SPLIT', occurredAt: at('2025-02-01T00:00:00Z'), quantity: '10', ...stock }),
        sell('2025-03-01T00:00:00Z', '20', '150'),
      ],
      'FIFO',
    );
    expect(result.sales[0]).toMatchObject({ costBasis: '100.00', realisedPnl: '50.00' });
    expect(result.warnings).toEqual([]);
  });

  it('includes FX fees in cost and proceeds, unlike the realised P&L Trading 212 reports', () => {
    // Shapes of real practice-account fills (2026): netValue already contains the FX fee.
    const result = computeCostBasis(
      [
        buy('2026-05-06T13:00:00Z', '1.26075908', '301.00', '0.45'),
        { ...sell('2026-05-29T14:39:53Z', '1.26075908', '301.83', '0.45'), brokerRealisedPnl: '1.73' },
      ],
      'AVERAGE',
    );
    // T212 ignores both fees: 1.73 - 0.45 - 0.45 = 0.83
    expect(result.sales[0]).toMatchObject({ realisedPnl: '0.83', brokerRealisedPnl: '1.73' });
  });

  it('rounds per-sale money to cents', () => {
    const result = computeCostBasis(
      [buy('2025-01-01T00:00:00Z', '3', '10'), sell('2025-01-02T00:00:00Z', '1', '5')],
      'AVERAGE',
    );
    expect(result.sales[0]).toMatchObject({ costBasis: '3.33', realisedPnl: '1.67' });
  });

  it('assigns entries to the Greek tax year, not the UTC one', () => {
    // 31 Dec 23:30 UTC is already 1 Jan in Athens.
    const late = entry({ kind: 'INTEREST', occurredAt: at('2025-12-31T23:30:00Z'), cashAmount: '1' });
    expect(computeCostBasis([late], 'AVERAGE').years.map((y) => y.year)).toEqual([2026]);
    expect(computeCostBasis([late], 'AVERAGE', 'UTC').years.map((y) => y.year)).toEqual([2025]);
  });

  it('ignores internal transfers', () => {
    const result = computeCostBasis(
      [entry({ kind: 'TRANSFER', occurredAt: at('2025-01-01T00:00:00Z'), cashAmount: '-100' })],
      'AVERAGE',
    );
    expect(result.years[0]).toMatchObject({ deposits: '0', withdrawals: '0' });
  });
});
