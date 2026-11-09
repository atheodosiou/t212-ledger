import type { EngineEntry } from './cost-basis.js';
import { buildTimeline, fillMonths } from './timeline.js';

let seq = 0;
const stock = {
  ticker: 'BTDR_US_EQ',
  isin: 'KYG112481015',
  instrumentName: 'Bitdeer',
};
function entry(
  partial: Partial<EngineEntry> & Pick<EngineEntry, 'kind' | 'occurredAt'>,
): EngineEntry {
  return {
    id: `t${++seq}`,
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

describe('buildTimeline', () => {
  // Averaging down: buy high, buy lower, then sell part.
  const ledger = [
    entry({
      kind: 'DEPOSIT',
      occurredAt: at('2026-07-01T09:00:00Z'),
      cashAmount: '300',
    }),
    entry({
      kind: 'BUY',
      occurredAt: at('2026-07-31T15:00:00Z'),
      quantity: '10',
      cashAmount: '-140',
      fees: '0.2',
      ...stock,
    }),
    entry({
      kind: 'BUY',
      occurredAt: at('2026-10-09T15:00:00Z'),
      quantity: '20',
      cashAmount: '-100',
      fees: '0.1',
      ...stock,
    }),
    entry({
      kind: 'SELL',
      occurredAt: at('2026-10-20T15:00:00Z'),
      quantity: '-6',
      cashAmount: '48',
      fees: '0.05',
      ...stock,
    }),
    entry({
      kind: 'WITHDRAWAL',
      occurredAt: at('2026-10-31T22:30:00Z'),
      cashAmount: '-50',
    }),
  ];

  it('buckets money by month in Greek time and fills empty months', () => {
    const { months } = buildTimeline(ledger, 'AVERAGE');
    expect(months.map((m) => m.month)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(months[0]).toMatchObject({
      deposits: '300.00',
      purchases: '140.00',
      buys: 1,
      cumulativeNetDeposits: '300.00',
    });
    expect(months[1]).toMatchObject({ purchases: '0.00', buys: 0 });
    // 31 Oct 22:30 UTC is 00:30 on 1 Nov in Athens (UTC+2 after the October clock change).
    expect(months[4]).toMatchObject({
      withdrawals: '50.00',
      cumulativeNetDeposits: '250.00',
    });
    expect(months[3]).toMatchObject({
      saleProceeds: '48.00',
      realisedPnl: '0.00',
      sells: 1,
      fees: '0.15',
    });
  });

  it('shows how each purchase moves the average cost', () => {
    const [btdr] = buildTimeline(ledger, 'AVERAGE').instruments;
    expect(btdr).toMatchObject({
      ticker: 'BTDR_US_EQ',
      trades: 3,
      currentQuantity: '24',
    });
    expect(btdr.events.map((e) => [e.pricePerShare, e.averageCost])).toEqual([
      ['14.0000', '14.0000'],
      ['5.0000', '8.0000'],
      ['8.0000', '8.0000'],
    ]);
  });

  it('journey: money in each position at the end of every month', () => {
    const { journey } = buildTimeline(ledger, 'AVERAGE');
    expect(journey.series.map((s) => s.ticker)).toEqual([
      'BTDR_US_EQ',
      'Λοιπά',
    ]);
    expect(
      journey.months.map((m) => [m.month, m.invested, m.positions]),
    ).toEqual([
      ['2026-07', '140.00', 1],
      ['2026-08', '140.00', 1],
      ['2026-09', '140.00', 1],
      // Bought 20 more for 100 (30 at 8 each), then sold 6: 24 × 8.
      ['2026-10', '192.00', 1],
      ['2026-11', '192.00', 1],
    ]);
    expect(journey.months[3].values).toEqual(['192.00', '0.00']);
    expect(journey.milestones.map((m) => [m.kind, m.ticker, m.amount])).toEqual(
      [
        ['FIRST_DEPOSIT', null, '300.00'],
        ['NEW_POSITION', 'BTDR_US_EQ', '140.00'],
        ['WITHDRAWAL', null, '50.00'],
      ],
    );
  });

  it('journey: marks a position closed with its result, and when it is opened again', () => {
    const other = {
      ticker: 'KO_US_EQ',
      isin: 'US1912161007',
      instrumentName: 'Coca-Cola',
    };
    const { journey } = buildTimeline(
      [
        entry({
          kind: 'BUY',
          occurredAt: at('2026-01-10T10:00:00Z'),
          quantity: '2',
          cashAmount: '-100',
          ...other,
        }),
        entry({
          kind: 'SELL',
          occurredAt: at('2026-02-10T10:00:00Z'),
          quantity: '-1',
          cashAmount: '60',
          ...other,
        }),
        entry({
          kind: 'SELL',
          occurredAt: at('2026-03-10T10:00:00Z'),
          quantity: '-1',
          cashAmount: '70',
          ...other,
        }),
        entry({
          kind: 'BUY',
          occurredAt: at('2026-05-10T10:00:00Z'),
          quantity: '1',
          cashAmount: '-65',
          ...other,
        }),
      ],
      'AVERAGE',
    );
    expect(
      journey.milestones.map((m) => [m.kind, m.realisedPnl, m.again]),
    ).toEqual([
      ['NEW_POSITION', null, false],
      ['CLOSED', '30.00', false],
      ['NEW_POSITION', null, true],
    ]);
    expect(journey.months.map((m) => m.invested)).toEqual([
      '100.00',
      '50.00',
      '0.00',
      '0.00',
      '65.00',
    ]);
  });

  it('fills months across a year boundary', () => {
    expect(fillMonths(['2025-11', '2026-02'])).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(fillMonths([])).toEqual([]);
  });
});
