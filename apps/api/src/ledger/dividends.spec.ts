import {
  DIVIDEND_ADJUSTMENT,
  dividendDetails,
  estimateDividends,
  type DividendInputEntry,
} from './dividends.js';

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

describe('dividendDetails with Trading 212 export rows', () => {
  // Realty Income, real account (2025-11-14): the export states 0.28 USD withheld.
  const realtyIncome = () =>
    e({
      kind: 'DIVIDEND',
      occurredAt: at('2025-11-14T11:51:52Z'),
      ticker: 'O_US_EQ',
      displayTicker: 'O',
      isin: 'US7561091049',
      instrumentCurrency: 'USD',
      quantity: '3.4637586',
      grossAmount: '0.93348294',
      cashAmount: '0.56',
    });
  const row = (over: Record<string, string> = {}) => ({
    occurredAt: at('2025-11-14T11:51:52Z'),
    action: 'Dividend (Dividend)',
    payload: {
      Action: 'Dividend (Dividend)',
      ISIN: 'US7561091049',
      'No. of shares': '3.4637586000',
      'Price / share': '0.188650',
      'Currency (Price / share)': 'USD',
      'Exchange rate': '0.859084',
      Total: '0.56',
      'Currency (Total)': 'EUR',
      'Withholding tax': '0.28',
      'Currency (Withholding tax)': 'USD',
      ...over,
    },
  });

  it("uses Trading 212's own withholding, converted at the dividend's rate", () => {
    const [d] = dividendDetails([realtyIncome()], 'EUR', [row()]);
    expect(d).toMatchObject({
      source: 'export',
      estimated: false,
      withheldOriginal: '0.28',
      withheldCurrency: 'USD',
      // 0.28 USD × 0.859084 EUR/USD
      withheld: '0.2405',
      grossAccount: '0.8005',
    });
  });

  it('falls back to the estimate when the row does not add up to the net credited', () => {
    const [d] = dividendDetails([realtyIncome()], 'EUR', [
      row({ Total: '0.99' }),
    ]);
    expect(d.source).toBe('estimate');
  });

  it('ignores a row for other shares or another day', () => {
    expect(
      dividendDetails([realtyIncome()], 'EUR', [
        row({ 'No. of shares': '3.5' }),
      ])[0].source,
    ).toBe('estimate');
    expect(
      dividendDetails([realtyIncome()], 'EUR', [
        { ...row(), occurredAt: at('2025-11-20T00:00:00Z') },
      ])[0].source,
    ).toBe('estimate');
  });

  it('shows a withholding refund as negative tax, with its description', () => {
    const [d] = dividendDetails(
      [
        e({
          kind: 'DIVIDEND',
          sourceType: DIVIDEND_ADJUSTMENT,
          occurredAt: at('2026-04-06T16:09:27Z'),
          cashAmount: '0.08',
          note: '2025 US dividends withholding tax adjustment.',
        }),
      ],
      'EUR',
    );
    expect(d).toMatchObject({
      source: 'adjustment',
      net: '0.08',
      withheld: '-0.08',
      grossAccount: '0.00',
      note: '2025 US dividends withholding tax adjustment.',
    });
  });
});
