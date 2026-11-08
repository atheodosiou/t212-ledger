import { refreshReason } from './instruments.service.js';

const now = new Date('2026-11-08T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('refreshReason', () => {
  it('loads names the first time', () => {
    expect(refreshReason(null, 0, now)).toBe('never-checked');
  });

  it('does nothing when names are recent and complete', () => {
    expect(refreshReason(ago(2 * DAY), 0, now)).toBeNull();
  });

  it('checks weekly even when nothing is missing', () => {
    expect(refreshReason(ago(7 * DAY), 0, now)).toBe('weekly');
  });

  it('checks early for an unknown ticker, but at most once an hour', () => {
    expect(refreshReason(ago(2 * HOUR), 1, now)).toBe('unknown-tickers');
    expect(refreshReason(ago(10 * 60 * 1000), 1, now)).toBeNull();
  });
});
