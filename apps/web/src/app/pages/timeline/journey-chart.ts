import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { JourneyDto } from '@t212/shared';
import { money } from '../../core/format';
import { CHART, compactMoney, linearScale, niceTicks, observeWidth } from './chart-utils';

const HEIGHT = 280;
const M = { top: 12, right: 12, bottom: 28, left: 60 };

/**
 * One colour per instrument, then grey for everything else. Distinct for the common
 * kinds of colour blindness and readable against white.
 */
export const JOURNEY_COLORS = [
  '#2a78d6',
  '#eb6834',
  '#1a9e77',
  '#8e5cc4',
  '#d4a017',
  '#d1497b',
  '#4c9fc4',
];
const OTHER_COLOR = '#b8bec8';

const monthShort = new Intl.DateTimeFormat('el-GR', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});
const monthLong = new Intl.DateTimeFormat('el-GR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const asDate = (month: string) => new Date(`${month}-01T00:00:00Z`);

/**
 * Money in open positions at the end of every month, stacked by instrument. Hover or
 * tap a month to see what was held then.
 */
@Component({
  selector: 'app-journey-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <ul class="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-hidden="true">
      @for (s of journey().series; track s.key; let i = $index) {
        <li class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-sm" [style.background]="color(i)"></span>{{ s.ticker }}
        </li>
      }
    </ul>
    <svg
      [attr.width]="width()"
      [attr.height]="height"
      role="img"
      [attr.aria-label]="summary()"
      class="touch-pan-y select-none"
      (pointermove)="pick($event)"
      (pointerdown)="pick($event)"
      (pointerleave)="$event.pointerType === 'mouse' && hovered.set(null)"
    >
      @for (t of geometry().ticks; track t.value) {
        <line
          [attr.x1]="m.left"
          [attr.x2]="width() - m.right"
          [attr.y1]="t.y"
          [attr.y2]="t.y"
          [attr.stroke]="colors.grid"
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
      @for (a of geometry().areas; track a.key) {
        <path [attr.d]="a.path" [attr.fill]="a.color" stroke="#ffffff" stroke-width="0.75" />
      }
      @for (l of geometry().labels; track l.x) {
        <text [attr.x]="l.x" [attr.y]="height - 8" text-anchor="middle" class="fill-muted text-xs">
          {{ l.text }}
        </text>
      }
      @if (hovered() !== null) {
        <line
          [attr.x1]="geometry().xs[hovered()!]"
          [attr.x2]="geometry().xs[hovered()!]"
          [attr.y1]="m.top"
          [attr.y2]="m.top + innerH"
          [attr.stroke]="colors.average"
          stroke-dasharray="3 3"
        />
      }
      <line
        [attr.x1]="m.left"
        [attr.x2]="width() - m.right"
        [attr.y1]="m.top + innerH"
        [attr.y2]="m.top + innerH"
        [attr.stroke]="colors.axis"
      />
    </svg>

    @if (tooltip(); as t) {
      <div
        class="pointer-events-none absolute z-10 w-60 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg"
        [style.left.px]="t.left"
        [style.top.px]="36"
      >
        <p class="font-semibold capitalize">{{ t.title }}</p>
        <p class="mb-1.5 text-muted">
          {{ money(t.invested, currency()) }} σε {{ t.positions }}
          {{ t.positions === 1 ? 'θέση' : 'θέσεις' }}
        </p>
        <dl class="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5">
          @for (r of t.rows; track r.ticker) {
            <span class="size-2 rounded-sm" [style.background]="r.color"></span>
            <dt class="truncate text-muted">{{ r.ticker }}</dt>
            <dd class="text-right font-medium">{{ money(r.value, currency()) }}</dd>
          }
        </dl>
      </div>
    }
  `,
})
export class JourneyChart {
  readonly journey = input.required<JourneyDto>();
  readonly currency = input('EUR');
  /** The last series is "everything else" and drawn grey. */
  readonly lastIsOther = input(true);

  protected readonly width = observeWidth();
  protected readonly height = HEIGHT;
  protected readonly m = M;
  protected readonly innerH = HEIGHT - M.top - M.bottom;
  protected readonly colors = CHART;
  protected readonly hovered = signal<number | null>(null);
  protected readonly money = money;

  protected color(i: number): string {
    const last = this.journey().series.length - 1;
    return i === last && this.lastIsOther()
      ? OTHER_COLOR
      : JOURNEY_COLORS[i % JOURNEY_COLORS.length];
  }

  protected readonly geometry = computed(() => {
    const { series, months } = this.journey();
    const width = this.width();
    const innerW = width - M.left - M.right;
    const max = Math.max(1, ...months.map((m) => Number(m.invested)));
    const ticks = niceTicks(0, max);
    const y = linearScale([0, ticks[ticks.length - 1]], [M.top + this.innerH, M.top]);
    const step = months.length > 1 ? innerW / (months.length - 1) : 0;
    const xs = months.map((_, i) => (months.length > 1 ? M.left + i * step : M.left + innerW / 2));

    // Stack from the bottom: largest instrument first, everything else on top.
    const lower = months.map(() => 0);
    const areas = series.map((s, si) => {
      const bottom = [...lower];
      const top = months.map((m, i) => (lower[i] += Number(m.values[si] ?? 0)));
      const up = top.map((v, i) => `${xs[i]},${y(v)}`);
      const down = bottom.map((v, i) => `${xs[i]},${y(v)}`).reverse();
      return { key: s.key, color: this.color(si), path: `M${up.join('L')}L${down.join('L')}Z` };
    });

    const every = Math.ceil(months.length / Math.max(1, Math.floor(innerW / 64)));
    const labels = months
      .map((m, i) => ({ x: xs[i], text: monthShort.format(asDate(m.month)), i }))
      .filter((l) => l.i % every === 0);
    return {
      ticks: ticks.map((v) => ({ value: v, y: y(v), label: compactMoney(v, this.currency()) })),
      areas,
      labels,
      xs,
    };
  });

  protected readonly summary = computed(() => {
    const { months } = this.journey();
    if (!months.length) return 'Χωρίς θέσεις';
    const first = months[0];
    const last = months[months.length - 1];
    const peak = months.reduce((a, b) => (Number(b.invested) > Number(a.invested) ? b : a));
    return `Επενδυμένο κεφάλαιο από ${monthLong.format(asDate(first.month))} έως ${monthLong.format(asDate(last.month))}: σήμερα ${money(last.invested, this.currency())} σε ${last.positions} θέσεις, μέγιστο ${money(peak.invested, this.currency())} τον ${monthLong.format(asDate(peak.month))}.`;
  });

  protected readonly tooltip = computed(() => {
    const i = this.hovered();
    if (i === null) return null;
    const { series, months } = this.journey();
    const m = months[i];
    if (!m) return null;
    const rows = series
      .map((s, si) => ({ ticker: s.ticker, value: m.values[si] ?? '0', color: this.color(si) }))
      .filter((r) => Number(r.value) > 0)
      .reverse();
    const tooltipWidth = 240;
    const x = this.geometry().xs[i];
    const left = Math.min(Math.max(0, x + 12), this.width() - tooltipWidth);
    return {
      title: monthLong.format(asDate(m.month)),
      invested: m.invested,
      positions: m.positions,
      rows,
      left,
    };
  });

  protected pick(event: PointerEvent): void {
    const xs = this.geometry().xs;
    if (!xs.length) return;
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    this.hovered.set(best);
  }
}
