import { exportUrl } from './api';
import { apiErrorMessage, isSyncing, money, price, sumMoney, taxYear, ticker } from './format';

describe('format', () => {
  it('shows share prices with cents, and more digits only when they exist', () => {
    expect(price('129.1')).toBe('129,10');
    expect(price('6.0425')).toBe('6,0425');
    expect(price(null)).toBe('');
  });

  it('formats money the Greek way', () => {
    // Intl separates the symbol with a non-breaking space.
    expect(money('1234.5').replace(/\s/g, ' ')).toBe('1.234,50 €');
    expect(money(null)).toBe('—');
  });

  it('sums decimal strings without floating point drift', () => {
    expect(sumMoney(['0.1', '0.2', null, '-0.3'])).toBe('0.00');
    expect(sumMoney(['433.07', '-371.63'])).toBe('61.44');
  });

  it('uses the Greek tax year', () => {
    expect(taxYear('2025-12-31T23:30:00Z')).toBe(2026);
  });

  it('strips Trading 212 ticker suffixes', () => {
    expect(ticker('KO_US_EQ')).toBe('KO');
  });

  it('knows when a sync is in progress', () => {
    expect(isSyncing('RUNNING')).toBe(true);
    expect(isSyncing('IDLE')).toBe(false);
  });

  it('reads Nest error messages', () => {
    expect(apiErrorMessage({ error: { message: ['a', 'b'] } })).toBe('a · b');
    expect(apiErrorMessage({})).toContain('Κάτι πήγε στραβά');
  });

  it('builds export links', () => {
    expect(exportUrl('abc', 'pdf', 'FIFO', null)).toBe(
      '/api/accounts/abc/export?format=pdf&method=FIFO',
    );
    expect(exportUrl('abc', 'xlsx', 'AVERAGE', 2026)).toContain('year=2026');
  });
});
