import type { MilestoneDto } from '@t212/shared';
import { groupMilestones } from './journey-milestones';

const m = (
  kind: MilestoneDto['kind'],
  date: string,
  ticker: string | null = null,
  realisedPnl: string | null = null,
): MilestoneDto => ({
  kind,
  date,
  ticker,
  isin: ticker ? `ISIN-${ticker}` : null,
  instrumentName: null,
  amount: null,
  realisedPnl,
  again: false,
});

describe('groupMilestones', () => {
  it('sums positions opened and closed within a month into one line', () => {
    const [jan, feb] = groupMilestones([
      m('FIRST_DEPOSIT', '2024-01-02T10:00:00Z'),
      m('NEW_POSITION', '2024-01-03T10:00:00Z', 'MARA'),
      m('NEW_POSITION', '2024-01-03T11:00:00Z', 'NVDA'),
      m('CLOSED', '2024-01-05T10:00:00Z', 'MARA', '10.00'),
      m('CLOSED', '2024-01-06T10:00:00Z', 'NVDA', '-2.50'),
      m('NEW_POSITION', '2024-01-08T10:00:00Z', 'MARA'),
      m('CLOSED', '2024-02-01T10:00:00Z', 'MARA', '5.00'),
      m('NEW_POSITION', '2024-02-10T10:00:00Z', 'MARA'),
    ]);
    expect(jan.notes.map((n) => n.kind)).toEqual(['FIRST_DEPOSIT']);
    // Opened again in the same month and still held: one new position, not "again".
    expect(jan.opened.map((o) => [o.ticker, o.again])).toEqual([['MARA', false]]);
    expect(jan.quick).toEqual({ tickers: ['MARA', 'NVDA'], count: 2, pnl: '7.50' });
    expect(jan.closed).toEqual([]);

    // Held since January: closing it is a milestone, and buying it later is "again".
    expect(feb.closed.map((c) => c.ticker)).toEqual(['MARA']);
    expect(feb.opened.map((o) => [o.ticker, o.again])).toEqual([['MARA', true]]);
    expect(feb.quick.count).toBe(0);
  });
});
