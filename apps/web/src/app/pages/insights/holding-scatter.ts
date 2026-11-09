import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { HoldingCycleDto } from '@t212/shared';
import { date, money } from '../../core/format';
import { CHART, linearScale, niceTicks, observeWidth } from '../timeline/chart-utils';

const HEIGHT = 300;
const M = { top: 12, right: 12, bottom: 32, left: 48 };
const GAIN = '#047857';
const LOSS = '#be123c';

/** Where the time axis gets a label: a day, a week, a month, a year. */
const DAY_TICKS: [number, string][] = [
  [1 / 24, '1 ώρα'],
  [1, '1 ημέρα'],
  [7, '1 εβδομάδα'],
  [30, '1 μήνας'],
  [91, '3 μήνες'],
  [365, '1 χρόνος'],
  [730, '2 χρόνια'],
];

export function holdingLabel(days: number): string {
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return hours === 1 ? '1 ώρα' : `${hours} ώρες`;
  }
  if (days < 31) {
    const d = Math.round(days);
    return d === 1 ? '1 ημέρα' : `${d} ημέρες`;
  }
  if (days < 365) return `${Math.round(days / 30.4)} μήνες`;
  const years = days / 365;
  return years < 1.5 ? '1 χρόνος' : `${years.toFixed(1).replace('.', ',')} χρόνια`;
}

/**
 * Every closed position as a dot: how long it was held (log scale) against its return.
 * Dot size follows the money put in; colour, whether it made or lost money.
 */
@Component({
  selector: 'app-holding-scatter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <svg
      [attr.width]="width()"
      [attr.height]="height"
      role="img"
      [attr.aria-label]="cycles().length + ' κλειστές θέσεις: διάρκεια κατοχής και απόδοση'"
      class="touch-pan-y select-none"
      (pointermove)="pick($event)"
      (pointerdown)="pick($event)"
      (pointerleave)="$event.pointerType === 'mouse' && hovered.set(null)"
    >
      @for (t of geometry().yTicks; track t.value) {
        <line
          [attr.x1]="m.left"
          [attr.x2]="width() - m.right"
          [attr.y1]="t.y"
          [attr.y2]="t.y"
          [attr.stroke]="t.value === 0 ? colors.axis : colors.grid"
        />
        <text
          [attr.x]="m.left - 8"
          [attr.y]="t.y"
          dy="0.32em"
          text-anchor="end"
          class="fill-muted text-xs"
        >
          {{ t.label }}
        </text>
      }
      @for (t of geometry().xTicks; track t.x) {
        <line
          [attr.x1]="t.x"
          [attr.x2]="t.x"
          [attr.y1]="m.top"
          [attr.y2]="m.top + innerH"
          [attr.stroke]="colors.grid"
          stroke-dasharray="2 3"
        />
        <text
          [attr.x]="t.x"
          [attr.y]="height - 10"
          [attr.text-anchor]="t.x > width() - 40 ? 'end' : t.x < m.left + 20 ? 'start' : 'middle'"
          class="fill-muted text-xs"
        >
          {{ t.label }}
        </text>
      }
      @for (p of geometry().points; track $index; let i = $index) {
        <circle
          [attr.cx]="p.x"
          [attr.cy]="p.y"
          [attr.r]="p.r"
          [attr.fill]="p.color"
          [attr.fill-opacity]="hovered() === i ? 0.9 : 0.45"
          [attr.stroke]="p.color"
          [attr.stroke-width]="hovered() === i ? 2 : 1"
        />
      }
    </svg>

    @if (tooltip(); as t) {
      <div
        class="pointer-events-none absolute z-10 w-60 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg"
        [style.left.px]="t.left"
        [style.top.px]="t.top"
      >
        <p class="font-semibold">{{ t.c.ticker }}</p>
        <p class="truncate text-muted">{{ t.c.instrumentName }}</p>
        <dl class="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
          <dt class="text-muted">Από – έως</dt>
          <dd class="text-right">{{ date(t.c.opened) }} – {{ date(t.c.closed) }}</dd>
          <dt class="text-muted">Κράτησε</dt>
          <dd class="text-right">{{ holdingLabel(t.c.days) }}</dd>
          <dt class="text-muted">Αγορές</dt>
          <dd class="text-right">{{ money(t.c.invested, currency()) }}</dd>
          <dt class="text-muted">Αποτέλεσμα</dt>
          <dd
            class="text-right font-medium"
            [class.text-gain]="Number(t.c.realisedPnl) > 0"
            [class.text-loss]="Number(t.c.realisedPnl) < 0"
          >
            {{ money(t.c.realisedPnl, currency()) }} ({{ t.c.returnPct }}%)
          </dd>
        </dl>
      </div>
    }
  `,
})
export class HoldingScatter {
  readonly cycles = input.required<HoldingCycleDto[]>();
  readonly currency = input('EUR');

  protected readonly width = observeWidth();
  protected readonly height = HEIGHT;
  protected readonly m = M;
  protected readonly innerH = HEIGHT - M.top - M.bottom;
  protected readonly colors = CHART;
  protected readonly hovered = signal<number | null>(null);
  protected readonly money = money;
  protected readonly date = date;
  protected readonly holdingLabel = holdingLabel;
  protected readonly Number = Number;

  protected readonly geometry = computed(() => {
    const cycles = this.cycles();
    const width = this.width();
    // Log time axis: an hour to the longest hold (at least a month).
    const minDays = 1 / 24;
    const maxDays = Math.max(30, ...cycles.map((c) => c.days)) * 1.15;
    const lx = linearScale([Math.log10(minDays), Math.log10(maxDays)], [M.left, width - M.right]);
    const x = (days: number) => lx(Math.log10(Math.max(minDays, days)));
    const returns = cycles.map((c) => Number(c.returnPct));
    const yTicks = niceTicks(Math.min(-10, ...returns), Math.max(10, ...returns));
    const y = linearScale([yTicks[0], yTicks[yTicks.length - 1]], [M.top + this.innerH, M.top]);
    const maxInvested = Math.max(1, ...cycles.map((c) => Number(c.invested)));
    return {
      xTicks: DAY_TICKS.filter(([d]) => d <= maxDays)
        .map(([d, label]) => ({ x: x(d), label }))
        // Drop labels that would overlap the last one kept, on a narrow screen.
        .reduce<{ x: number; label: string }[]>(
          (kept, t) =>
            kept.length && t.x - kept[kept.length - 1].x < (t.x > width - M.right - 40 ? 120 : 64)
              ? kept
              : [...kept, t],
          [],
        ),
      yTicks: yTicks.map((v) => ({ value: v, y: y(v), label: `${v}%` })),
      points: cycles.map((c) => ({
        x: x(c.days),
        y: y(Number(c.returnPct)),
        r: 3 + 9 * Math.sqrt(Number(c.invested) / maxInvested),
        color: Number(c.realisedPnl) >= 0 ? GAIN : LOSS,
      })),
    };
  });

  protected readonly tooltip = computed(() => {
    const i = this.hovered();
    if (i === null) return null;
    const c = this.cycles()[i];
    const p = this.geometry().points[i];
    if (!c || !p) return null;
    const w = 240;
    const left = p.x + 14 + w > this.width() ? Math.max(0, p.x - 14 - w) : p.x + 14;
    return { c, left, top: Math.max(0, Math.min(p.y - 40, this.height - 150)) };
  });

  protected pick(event: PointerEvent): void {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    let best: number | null = null;
    let bestDistance = 24 ** 2;
    this.geometry().points.forEach((p, i) => {
      const d = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    if (best !== null || event.pointerType === 'mouse') this.hovered.set(best);
  }
}
