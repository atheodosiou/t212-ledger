import {
  afterNextRender,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  type Signal,
} from '@angular/core';

/** Chart colors. Buy/sell passed the colorblind and contrast checks on a white surface. */
export const CHART = {
  buy: '#2a78d6',
  sell: '#eb6834',
  average: '#374151',
  grid: '#e5e7eb',
  axis: '#6b7280',
  surface: '#ffffff',
} as const;

export function linearScale(
  domain: [number, number],
  range: [number, number],
): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** About `count` round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toFixed(10)));
  // The last tick is the top of the scale: it must reach the largest value.
  while (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(10)));
  return ticks;
}

/** A bar whose top corners are rounded and whose base sits flat on the baseline. */
export function roundedTopBar(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 4,
): string {
  if (height <= 0) return '';
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

export function triangle(cx: number, cy: number, size: number, up: boolean): string {
  const h = size;
  const w = size * 1.15;
  return up
    ? `M${cx},${cy - h * 0.6}L${cx + w / 2},${cy + h * 0.4}L${cx - w / 2},${cy + h * 0.4}Z`
    : `M${cx},${cy + h * 0.6}L${cx + w / 2},${cy - h * 0.4}L${cx - w / 2},${cy - h * 0.4}Z`;
}

const compact = new Intl.NumberFormat('el-GR', { notation: 'compact', maximumFractionDigits: 1 });
export function compactMoney(value: number, currency: string): string {
  const symbol = currency === 'EUR' ? '€' : currency;
  return `${compact.format(value)} ${symbol}`;
}

/** Width of the host element, kept current with a ResizeObserver. */
export function observeWidth(fallback = 640): Signal<number> {
  const host = inject(ElementRef<HTMLElement>);
  const width = signal(fallback);
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    const element = host.nativeElement as HTMLElement;
    width.set(element.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) =>
      width.set(Math.max(280, Math.floor(entry.contentRect.width))),
    );
    observer.observe(element);
    destroyRef.onDestroy(() => observer.disconnect());
  });
  return width.asReadonly();
}
