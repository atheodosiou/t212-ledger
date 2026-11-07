import ExcelJS from 'exceljs';
import { buildPdf } from './pdf.js';
import { buildReportData, displayTicker, type ExportLedgerEntry } from './report-data.js';
import { buildXlsx } from './xlsx.js';

let seq = 0;
function e(partial: Partial<ExportLedgerEntry> & Pick<ExportLedgerEntry, 'kind' | 'occurredAt'>): ExportLedgerEntry {
  return {
    id: `e${++seq}`,
    sourceType: partial.kind,
    ticker: null,
    isin: null,
    instrumentName: null,
    instrumentCurrency: null,
    quantity: null,
    price: null,
    fxRate: null,
    cashAmount: '0',
    fees: '0',
    grossAmount: null,
    brokerRealisedPnl: null,
    note: null,
    ...partial,
  };
}

const ko = { ticker: 'KO_US_EQ', isin: 'US1912161007', instrumentName: 'Coca-Cola', instrumentCurrency: 'USD' };
const at = (iso: string) => new Date(iso);

const ledger: ExportLedgerEntry[] = [
  e({ kind: 'DEPOSIT', occurredAt: at('2025-03-01T10:00:00Z'), cashAmount: '1000' }),
  e({ kind: 'BUY', occurredAt: at('2025-03-02T15:00:00Z'), quantity: '10', price: '60', fxRate: '1.1', cashAmount: '-545.70', fees: '0.25', ...ko }),
  e({ kind: 'DIVIDEND', occurredAt: at('2025-06-15T00:00:00Z'), quantity: '10', grossAmount: '5.1', cashAmount: '3.95', ...ko }),
  e({ kind: 'SELL', occurredAt: at('2026-02-10T15:00:00Z'), quantity: '-4', price: '70', cashAmount: '254.20', fees: '0.12', brokerRealisedPnl: '36.40', ...ko }),
  e({ kind: 'INTEREST', occurredAt: at('2026-02-28T00:00:00Z'), cashAmount: '0.42' }),
];

const meta = {
  accountLabel: 'Practice',
  environment: 'DEMO' as const,
  currency: 'EUR',
  method: 'AVERAGE' as const,
  generatedAt: at('2026-11-07T12:00:00Z'),
};

describe('buildReportData', () => {
  it('narrows the presentation to one year but keeps cost basis from the full history', () => {
    const data = buildReportData(ledger, { ...meta, year: 2026 });
    expect(data.years.map((y) => y.year)).toEqual([2026]);
    expect(data.buys).toHaveLength(0);
    // Cost comes from the 2025 purchase: 545.70 * 4/10 = 218.28
    expect(data.sales[0]).toMatchObject({ costBasis: '218.28', realisedPnl: '35.92' });
    expect(data.cashMovements.map((m) => m.kind)).toEqual(['INTEREST']);
    expect(data.closingHoldings[0]).toMatchObject({ quantity: '6', costBasis: '327.42' });
    // 2026 is still running on the generation date.
    expect(data.closingHoldingsTitle).toBe('Ανοιχτές θέσεις στις 07/11/2026');
  });

  it('dates closing holdings at 31 December for a finished year', () => {
    expect(buildReportData(ledger, { ...meta, year: 2025 }).closingHoldingsTitle).toBe('Ανοιχτές θέσεις στις 31/12/2025');
  });

  it('sums every year for the whole history', () => {
    const data = buildReportData(ledger, { ...meta, year: null });
    expect(data.years.map((y) => y.year)).toEqual([2025, 2026]);
    expect(data.totals).toMatchObject({ deposits: '1000.00', dividends: '3.95', interest: '0.42', fees: '0.37' });
    expect(data.meta.firstActivity).toEqual(at('2025-03-01T10:00:00Z'));
  });

  it('shows Trading 212 tickers without their internal suffix', () => {
    expect(displayTicker('KO_US_EQ')).toBe('KO');
    expect(displayTicker('VWCEd_EQ')).toBe('VWCEd');
  });
});

describe('buildXlsx', () => {
  it('writes one sheet per category with real numbers and SUM totals', async () => {
    const buffer = await buildXlsx(buildReportData(ledger, { ...meta, year: null }));
    const wb = new ExcelJS.Workbook();
    await loadXlsx(wb, buffer);

    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Σύνοψη',
      'Πωλήσεις',
      'Αγορές',
      'Μερίσματα',
      'Μετρητά',
      'Θέσεις',
      'Όλες οι κινήσεις',
    ]);

    const sales = wb.getWorksheet('Πωλήσεις')!;
    expect(sales.getCell('B4').value).toBe('KO');
    expect(sales.getCell('H4').value).toBe(35.92);
    expect(sales.getCell('H5').value).toMatchObject({ formula: 'SUM(H4:H4)', result: 35.92 });

    const summary = wb.getWorksheet('Σύνοψη')!;
    expect(summary.getCell('A4').value).toBe(2025);
    expect(summary.getCell('B4').value).toBe(1000);
  });

  it('adds a review sheet when the engine raised warnings', async () => {
    const orphanSell = e({ kind: 'SELL', occurredAt: at('2026-05-01T10:00:00Z'), quantity: '-1', cashAmount: '10', ticker: 'X_EQ', isin: 'X' });
    const wb = new ExcelJS.Workbook();
    await loadXlsx(wb, await buildXlsx(buildReportData([orphanSell], { ...meta, year: null })));
    expect(wb.getWorksheet('Έλεγχος')).toBeDefined();
  });
});

describe('buildPdf', () => {
  it('renders a PDF, including for an empty account', async () => {
    const full = await buildPdf(buildReportData(ledger, { ...meta, year: null }));
    expect(full.subarray(0, 5).toString()).toBe('%PDF-');
    const empty = await buildPdf(buildReportData([], { ...meta, year: 2026 }));
    expect(empty.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

// exceljs typings predate Node's generic Buffer type.
function loadXlsx(wb: ExcelJS.Workbook, buffer: Buffer) {
  return wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
}
