import {
  checkAgainstExport,
  exportRowKey,
  exportTime,
  type ApiRecord,
  type ExportRow,
} from './export-check.js';

const period = {
  from: new Date('2023-12-31T22:00:00Z'),
  to: new Date('2026-12-31T21:59:59Z'),
};

// A real sell of TSM (2024-01-09): the CSV time is a second before the API fill time.
const apiSell = (
  over: Partial<{ price: number; netValue: number }> = {},
): ApiRecord => ({
  source: 'ORDER',
  externalId: '1:2',
  occurredAt: new Date('2024-01-09T18:40:00Z'),
  payload: {
    order: {
      side: 'SELL',
      ticker: 'TSM_US_EQ',
      instrument: { isin: 'US8740391003' },
    },
    fill: {
      quantity: -5.4342,
      price: over.price ?? 100.99,
      filledAt: '2024-01-09T18:40:00.000Z',
      walletImpact: {
        netValue: over.netValue ?? 503.71,
        fxRate: 1.09,
        realisedProfitLoss: -0.76,
        taxes: [{ name: 'CURRENCY_CONVERSION_FEE', quantity: -0.76 }],
      },
    },
  },
});
const csvSell = (): ExportRow =>
  row({
    Action: 'Market sell',
    'Time (UTC)': '2024-01-09 18:39:59',
    ISIN: 'US8740391003',
    Ticker: 'TSM',
    ID: 'EOF8551277049',
    'No. of shares': '5.4342000000',
    'Price / share': '100.9900000000',
    'Exchange rate': '1.09000000',
    Result: '-0.76',
    Total: '503.71',
    'Currency conversion fee': '0.76',
  });

// A card deposit: one CSV row (1000 credited, fee 7), two API records (1007 and -7).
const apiDeposit: ApiRecord[] = [
  {
    source: 'TRANSACTION',
    externalId: 'dep-1',
    occurredAt: new Date('2024-01-11T13:23:49Z'),
    payload: {
      type: 'DEPOSIT',
      amount: 1007,
      dateTime: '2024-01-11T13:23:49.000Z',
      reference: 'dep-1',
    },
  },
  {
    source: 'TRANSACTION',
    externalId: 'fee-1',
    occurredAt: new Date('2024-01-11T13:23:49Z'),
    payload: {
      type: 'FEE',
      amount: -7,
      dateTime: '2024-01-11T13:23:49.000Z',
      reference: 'fee-1',
    },
  },
];
const csvDeposit = (): ExportRow =>
  row({
    Action: 'Deposit',
    'Time (UTC)': '2024-01-11 13:23:49',
    ID: 'dep-1',
    Total: '1000.00',
    'Charge amount': '1007.00',
    'Deposit fee': '-7.00',
  });

function row(payload: Record<string, string>): ExportRow {
  return {
    rowKey: exportRowKey(payload),
    action: payload.Action,
    occurredAt: exportTime(payload['Time (UTC)']),
    externalId: payload.ID || null,
    payload,
  };
}

describe('checkAgainstExport', () => {
  it('matches orders a second apart and card deposits with their fee', () => {
    const check = checkAgainstExport(
      [apiSell(), ...apiDeposit],
      [csvSell(), csvDeposit()],
      period,
    );
    expect(check).toMatchObject({
      ok: true,
      compared: { orders: 1, dividends: 0, cash: 1 },
      differences: [],
    });
  });

  it('reports a figure that differs', () => {
    const check = checkAgainstExport(
      [apiSell({ netValue: 503.7 })],
      [csvSell()],
      period,
    );
    expect(check.ok).toBe(false);
    expect(check.differences).toEqual([
      expect.objectContaining({
        kind: 'mismatch',
        detail: expect.stringContaining('σύνολο 503.71'),
      }),
    ]);
  });

  it('reports records on one side only', () => {
    const missing = checkAgainstExport([], [csvSell()], period);
    expect(missing.differences.map((d) => d.kind)).toEqual([
      'missing-from-api',
    ]);
    const extra = checkAgainstExport([apiSell()], [], period);
    expect(extra.differences.map((d) => d.kind)).toEqual([
      'missing-from-export',
    ]);
  });

  it('leaves out records after the period the export covers', () => {
    const later = {
      ...apiSell(),
      occurredAt: new Date('2027-01-05T00:00:00Z'),
    };
    expect(checkAgainstExport([later], [], period).ok).toBe(true);
  });
});

describe('export rows', () => {
  it('are keyed by their ID, or by content when they have none', () => {
    expect(exportRowKey({ ID: 'EOF1', Action: 'Market buy' })).toBe('id:EOF1');
    expect(
      exportRowKey({
        ID: '',
        Action: 'Dividend (Dividend)',
        'Time (UTC)': '2025-11-14 11:51:52',
        ISIN: 'US7561091049',
        'No. of shares': '3.46',
        Total: '0.56',
      }),
    ).toBe(
      'row|Dividend (Dividend)|2025-11-14 11:51:52|US7561091049|3.46|0.56',
    );
  });

  it('read times as UTC, with or without an offset', () => {
    expect(exportTime('2024-01-09 18:39:59').toISOString()).toBe(
      '2024-01-09T18:39:59.000Z',
    );
    expect(exportTime('2024-01-09 18:39:59+00:00').toISOString()).toBe(
      '2024-01-09T18:39:59.000Z',
    );
  });
});
