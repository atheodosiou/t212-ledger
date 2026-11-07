import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { PositionEventDto } from '@t212/shared';
import { date, money, qty } from '../../core/format';
import { CHART, linearScale, niceTicks, observeWidth, triangle } from './chart-utils';

const HEIGHT = 280;
const M = { top: 16, right: 16, bottom: 28, left: 64 };
const DAY = 86_400_000;
const axisDate = new Intl.DateTimeFormat('el-GR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Athens',
});

@Component({
  selector: 'app-instrument-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <div class="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted" aria-hidden="true">
      <span class="flex items-center gap-1.5">
        <svg width="12" height="12"><path [attr.d]="legendUp" [attr.fill]="colors.buy" /></svg>Αγορά
      </span>
      <span class="flex items-center gap-1.5">
        <svg width="12" height="12"><path [attr.d]="legendDown" [attr.fill]="colors.sell" /></svg
        >Πώληση
      </span>
      <span class="flex items-center gap-1.5">
        <span class="h-0.5 w-4" [style.background]="colors.average"></span>Μέση τιμή κτήσης
      </span>
      <span class="ml-auto">Τιμή ανά μετοχή με χρεώσεις, σε {{ currency() }}</span>
    </div>
    <svg
      [attr.width]="width()"
      [attr.height]="height"
      role="img"
      [attr.aria-label]="
        'Αγορές, πωλήσεις και μέση τιμή κτήσης, ' + points().length + ' συναλλαγές'
      "
      (mouseleave)="hovered.set(null)"
    >
      @for (t of geometry().yTicks; track t.value) {
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
          class="fill-muted text-[11px]"
        >
          {{ t.label }}
        </text>
      }
      @for (t of geometry().xTicks; track t.x) {
        <text
          [attr.x]="t.x"
          [attr.y]="height - 8"
          text-anchor="middle"
          class="fill-muted text-[11px]"
        >
          {{ t.label }}
        </text>
      }
      <line
        [attr.x1]="m.left"
        [attr.x2]="width() - m.right"
        [attr.y1]="height - m.bottom"
        [attr.y2]="height - m.bottom"
        [attr.stroke]="colors.axis"
      />

      <path
        [attr.d]="geometry().averagePath"
        fill="none"
        [attr.stroke]="colors.average"
        stroke-width="2"
        stroke-linejoin="round"
      />

      @for (p of geometry().markers; track p.event.entryId; let i = $index) {
        <path
          [attr.d]="p.shape"
          [attr.fill]="p.event.kind === 'BUY' ? colors.buy : colors.sell"
          [attr.stroke]="colors.surface"
          stroke-width="2"
          [attr.opacity]="hovered() === null || hovered() === i ? 1 : 0.35"
        />
        <circle
          [attr.cx]="p.x"
          [attr.cy]="p.y"
          r="12"
          fill="transparent"
          tabindex="0"
          class="outline-none"
          [attr.aria-label]="p.aria"
          (mouseenter)="hovered.set(i)"
          (focus)="hovered.set(i)"
          (blur)="hovered.set(null)"
        />
      }
    </svg>

    @if (tooltip(); as t) {
      <div
        class="pointer-events-none absolute z-10 w-60 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg"
        [style.left.px]="t.left"
        [style.top.px]="t.top"
      >
        <p class="mb-1.5 font-semibold">{{ t.title }}</p>
        <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
          @for (row of t.rows; track row[0]) {
            <dt class="text-muted">{{ row[0] }}</dt>
            <dd class="text-right font-medium">{{ row[1] }}</dd>
          }
        </dl>
      </div>
    }
  `,
})
export class InstrumentChart {
  readonly events = input.required<PositionEventDto[]>();
  readonly currency = input('EUR');

  protected readonly width = observeWidth();
  protected readonly height = HEIGHT;
  protected readonly m = M;
  protected readonly colors = CHART;
  protected readonly hovered = signal<number | null>(null);
  protected readonly legendUp = triangle(6, 7, 10, true);
  protected readonly legendDown = triangle(6, 5, 10, false);

  /** Trades only; corporate actions have no price. */
  protected readonly points = computed(() => this.events().filter((e) => e.pricePerShare !== null));

  protected readonly geometry = computed(() => {
    const events = this.events();
    const points = this.points();
    const width = this.width();
    const times = events.map((e) => new Date(e.date).getTime());
    let t0 = Math.min(...times);
    let t1 = Math.max(...times);
    if (!Number.isFinite(t0)) t0 = t1 = Date.now();
    if (t1 - t0 < DAY) {
      t0 -= DAY;
      t1 += DAY;
    }
    const pad = (t1 - t0) * 0.04;
    const x = linearScale([t0 - pad, t1 + pad], [M.left, width - M.right]);

    const values = [
      ...points.map((p) => Number(p.pricePerShare)),
      ...events.filter((e) => e.averageCost !== null).map((e) => Number(e.averageCost)),
    ];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const yPad = Math.max((hi - lo) * 0.12, hi * 0.02, 0.01);
    const yTicks = niceTicks(Math.max(0, lo - yPad), hi + yPad);
    const y = linearScale([yTicks[0], yTicks[yTicks.length - 1]], [HEIGHT - M.bottom, M.top]);

    // Step line of the average cost, broken while the position is closed.
    let path = '';
    let penDown = false;
    events.forEach((e, i) => {
      if (e.averageCost === null) {
        penDown = false;
        return;
      }
      const xi = x(times[i]);
      const yi = y(Number(e.averageCost));
      const xNext = i + 1 < events.length ? x(times[i + 1]) : width - M.right;
      path += penDown ? `V${yi}H${xNext}` : `M${xi},${yi}H${xNext}`;
      penDown = true;
    });

    const tickCount = Math.max(2, Math.floor((width - M.left - M.right) / 90));
    const xTicks = Array.from({ length: tickCount }, (_, k) => {
      const t = t0 + ((t1 - t0) * k) / (tickCount - 1);
      return { x: x(t), label: axisDate.format(new Date(t)) };
    });

    const c = this.currency();
    return {
      averagePath: path,
      yTicks: yTicks.map((v) => ({ value: v, y: y(v), label: money(v, c) })),
      xTicks,
      markers: points.map((event) => {
        const px = x(new Date(event.date).getTime());
        const py = y(Number(event.pricePerShare));
        const isBuy = event.kind === 'BUY';
        return {
          event,
          x: px,
          y: py,
          shape: triangle(px, py, 11, isBuy),
          aria: `${isBuy ? 'Αγορά' : 'Πώληση'} ${date(event.date)}, ${qty(event.quantity.replace('-', ''))} μετοχές στα ${money(event.pricePerShare, c)}`,
        };
      }),
    };
  });

  protected readonly tooltip = computed(() => {
    const i = this.hovered();
    if (i === null) return null;
    const marker = this.geometry().markers[i];
    if (!marker) return null;
    const e = marker.event;
    const c = this.currency();
    const rows: [string, string][] = [
      ['Μετοχές', qty(e.quantity.replace('-', ''))],
      ['Τιμή ανά μετοχή', money(e.pricePerShare, c)],
      ['Θέση μετά', qty(e.positionQuantity)],
      ['Μέση τιμή μετά', e.averageCost ? money(e.averageCost, c) : 'Έκλεισε'],
    ];
    if (e.realisedPnl !== null) rows.push(['Αποτέλεσμα', money(e.realisedPnl, c)]);
    const tooltipWidth = 240;
    return {
      title: `${e.kind === 'BUY' ? 'Αγορά' : 'Πώληση'} · ${date(e.date)}`,
      rows,
      left: Math.min(Math.max(0, marker.x + 14), this.width() - tooltipWidth),
      top: Math.max(0, marker.y + 20),
    };
  });
}
