import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import type { TaxClass } from '../db/schema.js';
import type { RealisedSale } from '../ledger/cost-basis.js';
import type { DividendDetail } from '../ledger/dividends.js';
import {
  computeTaxYear,
  DEFAULT_TAX_PROFILE,
  lossPool,
  suggestTaxClass,
  type TaxInput,
} from './tax.js';

const yearOf = (d: Date) => d.getUTCFullYear();

const sale = (
  isin: string,
  date: string,
  pnl: string,
  cost = '100',
): RealisedSale => ({
  entryId: `${isin}-${date}`,
  date: new Date(date),
  ticker: isin,
  isin,
  instrumentName: isin,
  quantity: '1',
  proceeds: new Decimal(cost).plus(pnl).toFixed(2),
  costBasis: cost,
  realisedPnl: pnl,
  sellFees: '0',
  brokerRealisedPnl: null,
  unmatchedQuantity: '0',
});

const dividend = (
  isin: string,
  date: string,
  gross: string,
  withheld: string,
  source: DividendDetail['source'] = 'export',
): DividendDetail => ({
  entryId: `${isin}-${date}`,
  date: new Date(date),
  ticker: isin,
  isin,
  instrumentName: isin,
  shares: '1',
  grossInstrument: null,
  instrumentCurrency: 'USD',
  net: new Decimal(gross).minus(withheld).toFixed(2),
  fxRate: null,
  grossAccount: gross,
  withheld,
  withheldOriginal: null,
  withheldCurrency: null,
  withholdingRate: null,
  source,
  estimated: source === 'estimate',
  note: null,
});

const CLASSES: Record<string, TaxClass> = {
  US_SHARE: 'SHARE',
  IE_UCITS: 'UCITS',
  IE_GOLD: 'ETC',
  US_ETF: 'FUND_NON_EU',
};

function input(over: Partial<TaxInput>): TaxInput {
  const sales = over.sales ?? [];
  const classOf = (isin: string | null) => CLASSES[isin ?? ''] ?? 'SHARE';
  const netByYear = new Map<number, Decimal>();
  for (const s of sales) {
    if (!['ETC', 'FUND_NON_EU', 'SHARE_QUALIFYING'].includes(classOf(s.isin)))
      continue;
    const y = yearOf(s.date);
    netByYear.set(y, (netByYear.get(y) ?? new Decimal(0)).plus(s.realisedPnl));
  }
  return {
    year: 2025,
    sales,
    dividends: [],
    interest: [],
    purchases: '0',
    classOf,
    profile: DEFAULT_TAX_PROFILE,
    taxableNetByYear: netByYear,
    yearOf,
    ...over,
  };
}

describe('suggestTaxClass', () => {
  it('treats shares as shares, wherever they are listed', () => {
    expect(
      suggestTaxClass({ isin: 'US0378331005', type: 'STOCK', name: 'Apple' }),
    ).toBe('SHARE');
  });
  it('treats EU/EEA funds as UCITS and other funds as non-EU funds', () => {
    expect(
      suggestTaxClass({
        isin: 'IE00BK5BQT80',
        type: 'ETF',
        name: 'Vanguard FTSE All-World',
      }),
    ).toBe('UCITS');
    expect(
      suggestTaxClass({
        isin: 'LU1437018838',
        type: 'ETF',
        name: 'Amundi EPRA',
      }),
    ).toBe('UCITS');
    expect(
      suggestTaxClass({
        isin: 'US78462F1030',
        type: 'ETF',
        name: 'SPDR S&P 500',
      }),
    ).toBe('FUND_NON_EU');
  });
  it('spots commodities and notes Trading 212 lists as ETFs', () => {
    expect(
      suggestTaxClass({
        isin: 'IE00B4ND3602',
        type: 'ETF',
        name: 'iShares Physical Gold',
      }),
    ).toBe('ETC');
    expect(
      suggestTaxClass({
        isin: 'GB00BLD4ZL17',
        type: 'ETF',
        name: 'CoinShares Bitcoin',
      }),
    ).toBe('ETC');
  });
});

describe('computeTaxYear', () => {
  it('dividends: 5% Greek tax, credit capped per dividend at that tax', () => {
    const t = computeTaxYear(
      input({
        dividends: [
          dividend('US_SHARE', '2025-03-01', '10.00', '3.00'), // 30% withheld: nothing due
          dividend('NL_SHARE', '2025-04-01', '20.00', '0.00'), // none withheld: 1.00 due
          dividend('JP_SHARE', '2025-05-01', '10.00', '0.30'), // 3%: 0.20 due
        ],
      }),
    );
    expect(t.dividends.gross).toBe('40.00');
    expect(t.dividends.greekTax).toBe('2.00');
    expect(t.dividends.credit).toBe('0.80');
    expect(t.dividends.due).toBe('1.20');
    expect(t.e1.find((l) => l.code === '295')?.amount).toBe('40.00');
    expect(t.e1.find((l) => l.code === '683')?.amount).toBe('0.80');
  });

  it('dividends from UCITS are exempt and reported in 659', () => {
    const t = computeTaxYear(
      input({
        dividends: [dividend('IE_UCITS', '2025-03-01', '10.00', '0.00')],
      }),
    );
    expect(t.dividends.due).toBe('0.00');
    expect(t.dividends.exemptGross).toBe('10.00');
    expect(t.e1.find((l) => l.code === '659')?.amount).toBe('10.00');
    expect(t.e1.find((l) => l.code === '295')?.amount).toBe('0.00');
  });

  it('a refund of withheld tax lowers the credit, never below zero', () => {
    const t = computeTaxYear(
      input({
        dividends: [
          dividend('US_SHARE', '2025-03-01', '10.00', '0.60'),
          dividend('US_SHARE', '2025-06-01', '0.00', '-0.50', 'adjustment'),
        ],
      }),
    );
    expect(t.dividends.adjustments).toBe('-0.50');
    expect(t.dividends.credit).toBe('0.10');
    expect(t.dividends.due).toBe('0.40');
  });

  it('interest: 15%, or exempt when the user treats it as fund income', () => {
    const interest = [
      { date: new Date('2025-01-31'), amount: '1.50' },
      { date: new Date('2025-02-28'), amount: '0.81' },
      { date: new Date('2024-12-31'), amount: '9.00' },
    ];
    const t = computeTaxYear(input({ interest }));
    expect(t.interest.gross).toBe('2.31');
    expect(t.interest.tax).toBe('0.35');
    expect(t.e1.find((l) => l.code === '669')?.amount).toBe('2.31');

    const exempt = computeTaxYear(
      input({
        interest,
        profile: { ...DEFAULT_TAX_PROFILE, interest: 'EXEMPT' },
      }),
    );
    expect(exempt.interest.tax).toBe('0.00');
    expect(exempt.e1.find((l) => l.code === '669')?.amount).toBe('0.00');
    expect(exempt.e1.find((l) => l.code === '659')?.amount).toBe('2.31');
  });

  it('gains on shares and UCITS are exempt; their losses do not count', () => {
    const t = computeTaxYear(
      input({
        sales: [
          sale('US_SHARE', '2025-02-01', '120.00'),
          sale('US_SHARE', '2025-03-01', '-500.00'),
          sale('IE_UCITS', '2025-04-01', '30.00'),
        ],
      }),
    );
    expect(t.gains.exemptGains).toBe('150.00');
    expect(t.gains.exemptLosses).toBe('500.00');
    expect(t.gains.tax).toBe('0.00');
    expect(t.e1.find((l) => l.code === '659')?.amount).toBe('150.00');
    expect(t.e1.find((l) => l.code === '871')?.amount).toBe('0.00');
  });

  it('taxable classes are netted for the year and taxed at 15%', () => {
    const t = computeTaxYear(
      input({
        sales: [
          sale('IE_GOLD', '2025-02-01', '200.00'),
          sale('US_ETF', '2025-03-01', '-50.00'),
          sale('US_SHARE', '2025-03-01', '-1000.00'),
        ],
      }),
    );
    expect(t.gains.taxableNet).toBe('150.00');
    expect(t.gains.tax).toBe('22.50');
    expect(t.e1.find((l) => l.code === '865')?.amount).toBe('150.00');
    expect(t.totalDue).toBe('22.50');
  });

  it('a net loss goes to 871 and reduces gains of the next five years', () => {
    const sales = [
      sale('IE_GOLD', '2023-02-01', '-100.00'),
      sale('IE_GOLD', '2025-02-01', '60.00'),
      sale('IE_GOLD', '2026-02-01', '70.00'),
    ];
    const y2023 = computeTaxYear(input({ sales, year: 2023 }));
    expect(y2023.e1.find((l) => l.code === '871')?.amount).toBe('100.00');
    expect(y2023.gains.tax).toBe('0.00');

    const y2025 = computeTaxYear(input({ sales, year: 2025 }));
    expect(y2025.e1.find((l) => l.code === '865')?.amount).toBe('60.00');
    expect(y2025.e1.find((l) => l.code === '873')?.amount).toBe('100.00');
    expect(y2025.gains.lossesUsed).toBe('60.00');
    expect(y2025.gains.tax).toBe('0.00');
    expect(y2025.losses.pool[0]).toMatchObject({
      originYear: 2023,
      remaining: '40.00',
    });

    const y2026 = computeTaxYear(input({ sales, year: 2026 }));
    expect(y2026.e1.find((l) => l.code === '873')?.amount).toBe('40.00');
    expect(y2026.gains.taxableAfterLosses).toBe('30.00');
    expect(y2026.gains.tax).toBe('4.50');
  });

  it('justification: purchases in 743, cost of what was sold in 781', () => {
    const t = computeTaxYear(
      input({
        purchases: '1234.56',
        sales: [sale('US_SHARE', '2025-02-01', '10.00', '90.00')],
      }),
    );
    expect(t.e1.find((l) => l.code === '743')?.amount).toBe('1234.56');
    expect(t.e1.find((l) => l.code === '781')?.amount).toBe('90.00');
  });

  it('781: a sale at a loss returns its proceeds, not its cost', () => {
    const t = computeTaxYear(
      input({
        sales: [
          sale('US_SHARE', '2025-02-01', '10.00', '90.00'), // proceeds 100, 10 to 659
          sale('US_SHARE', '2025-03-01', '-30.00', '100.00'), // proceeds 70
        ],
      }),
    );
    const code = (c: string) => t.e1.find((l) => l.code === c)?.amount;
    expect(code('659')).toBe('10.00');
    expect(code('781')).toBe('160.00');
    expect(t.e1.find((l) => l.code === '781')?.detail).toContain('170,00 €');
  });

  it('781 + gains declared as income add up to what the sales brought in', () => {
    const sales = [
      sale('US_SHARE', '2025-02-01', '25.00', '200.00'),
      sale('US_SHARE', '2025-02-02', '-40.00', '100.00'),
      sale('IE_GOLD', '2025-03-01', '30.00', '100.00'),
      sale('IE_GOLD', '2025-03-02', '-10.00', '50.00'),
      sale('IE_UCITS', '2025-04-01', '5.00', '60.00'),
    ];
    const t = computeTaxYear(input({ sales }));
    const code = (c: string) => Number(t.e1.find((l) => l.code === c)?.amount);
    const proceeds = sales.reduce((s, x) => s + Number(x.proceeds), 0);
    expect(code('865')).toBe(20);
    expect(code('659')).toBe(30);
    expect(code('781') + code('659') + code('865')).toBeCloseTo(proceeds, 2);
  });

  it('781 with a net taxable loss: all of those proceeds are capital', () => {
    const t = computeTaxYear(
      input({ sales: [sale('IE_GOLD', '2025-03-01', '-20.00', '100.00')] }),
    );
    expect(t.e1.find((l) => l.code === '871')?.amount).toBe('20.00');
    expect(t.e1.find((l) => l.code === '781')?.amount).toBe('80.00');
  });

  it('dividend tax is 5% of the total, rounded once, as AADE computes it', () => {
    const t = computeTaxYear(
      input({
        dividends: [
          dividend('NL_SHARE', '2025-03-01', '0.10', '0.00'),
          dividend('NL_SHARE', '2025-04-01', '0.10', '0.00'),
          dividend('NL_SHARE', '2025-05-01', '0.10', '0.00'),
        ],
      }),
    );
    // Per line 0.005 each would round to 0.01 each (0.03); 5% of 0.30 is 0.015 → 0.02.
    expect(t.dividends.greekTax).toBe('0.02');
    expect(t.dividends.due).toBe('0.02');
  });

  it('683 explains what was withheld when only part of it is credited', () => {
    const t = computeTaxYear(
      input({
        dividends: [dividend('US_SHARE', '2025-03-01', '10.00', '3.00')],
      }),
    );
    const line = t.e1.find((l) => l.code === '683');
    expect(line?.amount).toBe('0.50');
    expect(line?.detail).toContain('3,00 €');
    expect(line?.detail).toContain('βεβαίωση');
  });
});

describe('lossPool', () => {
  const net = (entries: [number, string][]) =>
    new Map(entries.map(([y, v]) => [y, new Decimal(v)]));

  it('uses the oldest losses first', () => {
    const pool = lossPool(
      net([
        [2020, '-100'],
        [2021, '-50'],
        [2022, '120'],
      ]),
      [],
      2022,
    );
    expect(pool.map((p) => [p.originYear, p.remainingAfter.toFixed()])).toEqual(
      [
        [2020, '0'],
        [2021, '30'],
      ],
    );
  });

  it('a loss expires after five years', () => {
    const pool = lossPool(
      net([
        [2019, '-100'],
        [2025, '100'],
      ]),
      [],
      2025,
    );
    expect(pool).toEqual([]);
    const last = lossPool(
      net([
        [2019, '-100'],
        [2024, '30'],
      ]),
      [],
      2024,
    );
    expect(last[0].remainingAfter.toFixed()).toBe('70');
  });

  it('includes losses entered by the user from other brokers', () => {
    const pool = lossPool(
      net([[2025, '80']]),
      [{ year: 2023, amount: '200' }],
      2025,
    );
    expect(pool[0]).toMatchObject({ originYear: 2023, prior: true });
    expect(pool[0].usedThisYear.toFixed()).toBe('80');
    expect(pool[0].remainingAfter.toFixed()).toBe('120');
  });
});
