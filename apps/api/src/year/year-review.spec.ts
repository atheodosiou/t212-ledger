import type { DividendDetail } from '../ledger/dividends.js';
import type { InsightsEntry } from '../ledger/insights.js';
import { buildYearReview, yearsWithActivity } from './year-review.js';

let seq = 0;
const KO = {
  ticker: 'KO',
  isin: 'US1912161007',
  instrumentName: 'Coca-Cola',
  instrumentCurrency: 'USD',
};
const VW = {
  ticker: 'VWCE',
  isin: 'IE00BK5BQT80',
  instrumentName: 'Vanguard',
  instrumentCurrency: 'EUR',
};
const MA = {
  ticker: 'MARA',
  isin: 'US5657881067',
  instrumentName: 'MARA',
  instrumentCurrency: 'USD',
};

function e(
  partial: Partial<InsightsEntry> & Pick<InsightsEntry, 'kind' | 'occurredAt'>,
): InsightsEntry {
  return {
    id: `y${++seq}`,
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

const entries = [
  e({
    kind: 'DEPOSIT',
    occurredAt: at('2024-06-01T10:00:00Z'),
    cashAmount: '500',
  }),
  e({
    kind: 'BUY',
    occurredAt: at('2024-06-02T10:00:00Z'),
    quantity: '1',
    cashAmount: '-100',
    ...VW,
  }),
  e({
    kind: 'DEPOSIT',
    occurredAt: at('2025-01-05T10:00:00Z'),
    cashAmount: '1000',
  }),
  e({
    kind: 'BUY',
    occurredAt: at('2025-01-10T10:00:00Z'),
    quantity: '10',
    cashAmount: '-100',
    ...KO,
  }),
  e({
    kind: 'SELL',
    occurredAt: at('2025-01-13T10:00:00Z'),
    quantity: '-10',
    cashAmount: '130',
    ...KO,
  }),
  e({
    kind: 'BUY',
    occurredAt: at('2025-03-01T10:00:00Z'),
    quantity: '5',
    cashAmount: '-200',
    ...MA,
  }),
  e({
    kind: 'SELL',
    occurredAt: at('2025-09-01T10:00:00Z'),
    quantity: '-5',
    cashAmount: '150',
    ...MA,
  }),
  e({
    kind: 'BUY',
    occurredAt: at('2025-11-01T10:00:00Z'),
    quantity: '2',
    cashAmount: '-220',
    ...VW,
  }),
  e({
    kind: 'DIVIDEND',
    occurredAt: at('2025-06-01T10:00:00Z'),
    cashAmount: '2.10',
    ...KO,
  }),
];

const dividend: DividendDetail = {
  entryId: 'd1',
  date: at('2025-06-01T10:00:00Z'),
  ticker: 'KO',
  isin: KO.isin,
  instrumentName: 'Coca-Cola',
  shares: '10',
  grossInstrument: null,
  instrumentCurrency: 'USD',
  net: '2.10',
  fxRate: null,
  grossAccount: '3.00',
  withheld: '0.90',
  withheldOriginal: null,
  withheldCurrency: null,
  withholdingRate: '30.0',
  source: 'export',
  estimated: false,
  note: null,
};

describe('buildYearReview', () => {
  const histories = [{ entries, dividends: [dividend], charges: new Map() }];
  const review = buildYearReview(2025, histories, {
    now: at('2026-02-01T10:00:00Z'),
  });

  it('lists the years with activity, newest first', () => {
    expect(yearsWithActivity(histories)).toEqual([2025, 2024]);
  });

  it('sums the year and the year before it', () => {
    expect(review.partial).toBe(false);
    expect(review.totals).toMatchObject({
      deposits: '1000.00',
      purchases: '520.00',
      buys: 3,
      sells: 2,
      saleProceeds: '280.00',
      realisedPnl: '-20.00',
      dividends: '2.10',
    });
    expect(review.previous).toMatchObject({ deposits: '500.00', buys: 1 });
  });

  it('shows the portfolio at the start and the end of the year', () => {
    expect(review.portfolio).toMatchObject({
      investedStart: '100.00',
      investedEnd: '320.00',
      positionsStart: 1,
      positionsEnd: 1,
      opened: 2,
      closed: 2,
    });
    expect(review.portfolio.top).toEqual([
      {
        ticker: 'VWCE',
        instrumentName: 'Vanguard',
        costBasis: '320.00',
        share: '100.0',
      },
    ]);
  });

  it('picks the best and the worst position closed in the year', () => {
    expect(review.bestPosition).toMatchObject({
      ticker: 'KO',
      realisedPnl: '30.00',
      days: 3,
    });
    expect(review.worstPosition).toMatchObject({
      ticker: 'MARA',
      realisedPnl: '-50.00',
    });
    expect(review.bestInstrument?.ticker).toBe('KO');
    expect(review.worstInstrument?.ticker).toBe('MARA');
  });

  it('describes the habits of the year', () => {
    expect(review.habits.months).toHaveLength(12);
    expect(review.habits.busiestMonth).toEqual({ month: '2025-01', trades: 2 });
    expect(review.habits).toMatchObject({
      winRate: '50',
      quickShare: '50',
      closedPositions: 2,
    });
  });

  it('sums the dividends by payer', () => {
    expect(review.dividends).toEqual({
      net: '2.10',
      withheld: '0.90',
      payers: 1,
      top: { ticker: 'KO', instrumentName: 'Coca-Cola', net: '2.10' },
    });
    // 0.90 withheld, 0.15 credited against the Greek 5%.
    expect(review.costs.dividendTaxLost).toBe('0.75');
  });

  it('marks the running year as partial and copes with a year without activity', () => {
    expect(
      buildYearReview(2026, histories, { now: at('2026-02-01T10:00:00Z') }),
    ).toMatchObject({
      partial: true,
      totals: { buys: 0 },
      portfolio: { investedStart: '320.00', investedEnd: '320.00' },
      bestPosition: null,
    });
  });
});
