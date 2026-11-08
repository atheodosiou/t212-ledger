import { estimateDividends, type DividendInputEntry } from './dividends.js';

let seq = 0;
function e(
  partial: Partial<DividendInputEntry> &
    Pick<DividendInputEntry, 'kind' | 'occurredAt'>,
): DividendInputEntry {
  return {
    id: `d${++seq}`,
    ticker: null,
    isin: null,
    instrumentName: null,
    instrumentCurrency: null,
    quantity: null,
    cashAmount: '0',
    grossAmount: null,
    fxRate: null,
    ...partial,
  };
}
const at = (iso: string) => new Date(iso);

describe('estimateDividends', () => {
  it('derives the withholding exactly for dividends in the account currency', () => {
    // Pfizer on Xetra, real account: gross 2.6105 EUR, net 1.83 EUR (US 30%).
    const [pfe] = estimateDividends([
      e({
        kind: 'DIVIDEND',
        occurredAt: at('2025-12-01T10:00:00Z'),
        ticker: 'PFEd_EQ',
        displayTicker: 'PFE',
        instrumentCurrency: 'EUR',
        grossAmount: '2.6105',
        cashAmount: '1.83',
      }),
    ]);
    expect(pfe).toMatchObject({
      ticker: 'PFE',
      grossAccount: '2.61',
      withheld: '0.78',
      withholdingRate: '29.9',
      estimated: false,
    });
  });

  it('converts foreign gross with the FX rate of the nearest trade in that currency', () => {
    const details = estimateDividends([
      e({
        kind: 'BUY',
        occurredAt: at('2026-01-01T15:00:00Z'),
        instrumentCurrency: 'USD',
        fxRate: '1.20',
      }),
      e({
        kind: 'BUY',
        occurredAt: at('2026-06-01T15:00:00Z'),
        instrumentCurrency: 'USD',
        fxRate: '1.1344299900',
      }),
      // NVDA, real account: gross 0.7199 USD, net 0.44 EUR.
      e({
        kind: 'DIVIDEND',
        occurredAt: at('2026-06-26T10:00:00Z'),
        ticker: 'NVDA_US_EQ',
        instrumentCurrency: 'USD',
        grossAmount: '0.7199',
        cashAmount: '0.44',
      }),
    ]);
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      fxRate: '1.13442999',
      grossAccount: '0.63',
      withheld: '0.19',
      withholdingRate: '30.7',
      estimated: true,
    });
  });

  it('leaves the estimate empty when no rate is known for the currency', () => {
    const [d] = estimateDividends([
      e({
        kind: 'DIVIDEND',
        occurredAt: at('2026-03-25T10:00:00Z'),
        instrumentCurrency: 'CHF',
        grossAmount: '1.62',
        cashAmount: '1.15',
      }),
    ]);
    expect(d).toMatchObject({
      grossAccount: null,
      withheld: null,
      withholdingRate: null,
      estimated: true,
      net: '1.15',
    });
  });

  it('never reports negative withholding', () => {
    const [d] = estimateDividends([
      e({
        kind: 'DIVIDEND',
        occurredAt: at('2026-03-25T10:00:00Z'),
        instrumentCurrency: 'EUR',
        grossAmount: '1.00',
        cashAmount: '1.01',
      }),
    ]);
    expect(d.withheld).toBe('0.00');
  });
});
