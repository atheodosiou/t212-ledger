import { parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('reads quoted fields, doubled quotes, commas and line breaks', () => {
    const rows = parseCsv(
      '﻿Action,Notes,Total\r\n' +
        'Deposit,"Transaction ID: X, card",1000.00\r\n' +
        'Dividend adjustment,"2025 US ""dividends""\nwithholding",0.08\r\n',
    );
    expect(rows).toEqual([
      { Action: 'Deposit', Notes: 'Transaction ID: X, card', Total: '1000.00' },
      {
        Action: 'Dividend adjustment',
        Notes: '2025 US "dividends"\nwithholding',
        Total: '0.08',
      },
    ]);
  });

  it('keeps empty fields and ignores blank lines', () => {
    expect(parseCsv('a,b,c\n1,,3\n\n')).toEqual([{ a: '1', b: '', c: '3' }]);
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
