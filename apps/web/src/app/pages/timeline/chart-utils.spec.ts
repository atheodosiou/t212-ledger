import { linearScale, niceTicks, roundedTopBar, triangle } from './chart-utils';

describe('chart utils', () => {
  it('maps a domain onto a range', () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
  });

  it('picks round ticks that cover the data', () => {
    expect(niceTicks(0, 25461)).toEqual([0, 10000, 20000, 30000]);
    // Just past a step: the scale still reaches the top value.
    expect(niceTicks(0, 12369)).toEqual([0, 5000, 10000, 15000]);
    const ticks = niceTicks(230, 270);
    expect(ticks[0]).toBeLessThanOrEqual(230);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(270);
  });

  it('draws nothing for an empty bar', () => {
    expect(roundedTopBar(0, 10, 10, 0)).toBe('');
    expect(roundedTopBar(0, 10, 10, 20)).toMatch(/^M0,30V/);
  });

  it('points buy triangles up and sell triangles down', () => {
    expect(triangle(10, 10, 10, true)).toMatch(/^M10,4/);
    expect(triangle(10, 10, 10, false)).toMatch(/^M10,16/);
  });
});
