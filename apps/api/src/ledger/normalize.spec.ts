import type { T212OrderItem } from '../trading212/t212.types.js';
import { normalizeDividend, normalizeOrder, normalizeTransaction, orderIdentity, transactionKind } from './normalize.js';

const btdr = { ticker: 'BTDR_US_EQ', name: 'Bitdeer Technologies Group', isin: 'KYG112481015', currency: 'USD' };

function order(overrides: Partial<T212OrderItem['order']>, fill: T212OrderItem['fill']): T212OrderItem {
  return {
    order: {
      id: 59810257568,
      strategy: 'QUANTITY',
      type: 'LIMIT',
      ticker: 'BTDR_US_EQ',
      status: 'FILLED',
      currency: 'EUR',
      side: 'BUY',
      createdAt: '2026-11-02T15:16:00Z',
      instrument: btdr,
      ...overrides,
    },
    fill,
  };
}

describe('normalizeOrder', () => {
  it('maps a filled buy to a negative cash amount with fees', () => {
    const entry = normalizeOrder(
      order(
        {},
        {
          id: 59816768105,
          quantity: 8.61,
          price: 6.5,
          type: 'TRADE',
          filledAt: '2026-11-02T16:37:00Z',
          walletImpact: {
            currency: 'EUR',
            netValue: 49.94,
            fxRate: 1.12221776,
            taxes: [{ name: 'CURRENCY_CONVERSION_FEE', quantity: -0.07, currency: 'EUR' }],
          },
        },
      ),
    );

    expect(entry).toMatchObject({
      kind: 'BUY',
      ticker: 'BTDR_US_EQ',
      isin: 'KYG112481015',
      quantity: '8.61',
      price: '6.5',
      cashAmount: '-49.94',
      fees: '0.07',
      brokerRealisedPnl: null,
    });
  });

  it('maps a sell to a negative quantity and positive cash, keeping the broker P&L', () => {
    const entry = normalizeOrder(
      order(
        { side: 'SELL' },
        {
          id: 2,
          quantity: -10,
          price: 16,
          type: 'TRADE',
          filledAt: '2026-12-01T10:00:00Z',
          walletImpact: { currency: 'EUR', netValue: 142.5, fxRate: 1.12, realisedProfitLoss: 20.9 },
        },
      ),
    );
    expect(entry).toMatchObject({ kind: 'SELL', quantity: '-10', cashAmount: '142.5', brokerRealisedPnl: '20.9' });
  });

  it('skips orders that never filled', () => {
    expect(normalizeOrder(order({ status: 'CANCELLED' }, null))).toBeNull();
  });

  it('treats non-trade fills as corporate actions without cash impact', () => {
    const entry = normalizeOrder(
      order(
        {},
        {
          id: 3,
          quantity: 10,
          price: 0,
          type: 'STOCK_SPLIT',
          filledAt: '2026-06-01T00:00:00Z',
          walletImpact: { currency: 'EUR', netValue: 0, fxRate: 1 },
        },
      ),
    );
    expect(entry).toMatchObject({ kind: 'CORPORATE_ACTION', sourceType: 'STOCK_SPLIT', quantity: '10', cashAmount: '0' });
  });

  it('identifies an order item by order and fill id', () => {
    expect(orderIdentity(order({}, null)).externalId).toBe('59810257568:nofill');
  });
});

describe('normalizeTransaction', () => {
  it('maps deposits, fees and interest', () => {
    const base = { currency: 'EUR', dateTime: '2026-11-02T10:00:00Z' };
    expect(normalizeTransaction({ ...base, amount: 201.4, reference: 'a', type: 'DEPOSIT' })).toMatchObject({
      kind: 'DEPOSIT',
      cashAmount: '201.4',
      fees: '0',
    });
    expect(normalizeTransaction({ ...base, amount: -1.4, reference: 'b', type: 'FEE' })).toMatchObject({
      kind: 'FEE',
      cashAmount: '-1.4',
      fees: '1.4',
    });
    expect(normalizeTransaction({ ...base, amount: 0.01, reference: 'c', type: 'INTEREST' }).kind).toBe('INTEREST');
  });

  it('understands the type names used by real-money accounts', () => {
    const base = { currency: 'EUR', dateTime: '2024-11-19T16:49:19Z', reference: 'r' };
    expect(normalizeTransaction({ ...base, amount: 0.11, type: 'INTEREST_ON_FREE_CASH' }).kind).toBe('INTEREST');
    expect(normalizeTransaction({ ...base, amount: -4.95, type: 'WITHDRAW' }).kind).toBe('WITHDRAWAL');
  });

  it('classifies unseen variants by family', () => {
    expect(transactionKind('INTEREST_ON_SAVINGS')).toBe('INTEREST');
    expect(transactionKind('TRANSFER_TO_CARD')).toBe('TRANSFER');
    expect(transactionKind('CURRENCY_CONVERSION_FEE')).toBe('FEE');
    expect(transactionKind('CARD_CASHBACK')).toBe('OTHER');
  });

  it('keeps unknown types as OTHER with a note', () => {
    const entry = normalizeTransaction({
      amount: 3,
      currency: 'EUR',
      dateTime: '2026-11-02T10:00:00Z',
      reference: 'd',
      type: 'SOMETHING_NEW',
    });
    expect(entry).toMatchObject({ kind: 'OTHER', note: 'Unmapped transaction type SOMETHING_NEW' });
  });
});

describe('normalizeDividend', () => {
  it('computes the gross amount from the per-share figure', () => {
    const entry = normalizeDividend({
      amount: 2.55,
      grossAmountPerShare: 0.25,
      paidOn: '2026-03-15T00:00:00Z',
      quantity: 12,
      reference: 'div-1',
      ticker: 'KO_US_EQ',
      tickerCurrency: 'USD',
      type: 'ORDINARY',
    });
    expect(entry).toMatchObject({ kind: 'DIVIDEND', cashAmount: '2.55', grossAmount: '3', instrumentCurrency: 'USD' });
  });
});
