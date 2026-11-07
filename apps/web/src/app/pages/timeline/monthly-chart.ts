import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { MonthBucketDto } from '@t212/shared';
import { money } from '../../core/format';
import { CHART, compactMoney, linearScale, niceTicks, roundedTopBar } from './chart-utils';
import { observeWidth } from './chart-utils';

const HEIGHT = 260;
const M = { top: 12, right: 8, bottom: 28, left: 60 };
const monthLabel = new Intl.DateTimeFormat('el-GR', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});
const monthLong = new Intl.DateTimeFormat('el-GR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

@Component({
  selector: 'app-monthly-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <div class="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted" aria-hidden="true">
      <span class="flex items-center gap-1.5"
        ><span class="size-2.5 rounded-sm" [style.background]="colors.buy"></span>Αγορές</span
      >
      <span class="flex items-center gap-1.5"
        ><span class="size-2.5 rounded-sm" [style.background]="colors.sell"></span>Πωλήσεις</span
      >
    </div>
    <svg
      [attr.width]="width()"
      [attr.height]="height"
      role="img"
      [attr.aria-label]="'Αγορές και πωλήσεις ανά μήνα, ' + months().length + ' μήνες'"
      (mouseleave)="hovered.set(null)"
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
          class="fill-muted text-[11px]"
        >
          {{ t.label }}
        </text>
      }
      @for (b of geometry().bars; track b.month; let i = $index) {
        @if (hovered() === i) {
          <rect
            [attr.x]="b.bandX"
            [attr.y]="m.top"
            [attr.width]="b.bandW"
            [attr.height]="innerH"
            fill="#f3f4f6"
          />
        }
        <path [attr.d]="b.buyPath" [attr.fill]="colors.buy" />
        <path [attr.d]="b.sellPath" [attr.fill]="colors.sell" />
        @if (b.showLabel) {
          <text
            [attr.x]="b.cx"
            [attr.y]="height - 8"
            text-anchor="middle"
            class="fill-muted text-[11px]"
          >
            {{ b.label }}
          </text>
        }
        <rect
          [attr.x]="b.bandX"
          [attr.y]="m.top"
          [attr.width]="b.bandW"
          [attr.height]="innerH"
          fill="transparent"
          (mouseenter)="hovered.set(i)"
          (focus)="hovered.set(i)"
          (blur)="hovered.set(null)"
          tabindex="0"
          [attr.aria-label]="b.aria"
          class="cursor-default outline-none"
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

    @if (hovered() !== null && tooltip(); as t) {
      <div
        class="pointer-events-none absolute z-10 w-56 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg"
        [style.left.px]="t.left"
        [style.top.px]="40"
      >
        <p class="mb-1.5 font-semibold capitalize">{{ t.title }}</p>
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
export class MonthlyChart {
  readonly months = input.required<MonthBucketDto[]>();
  readonly currency = input('EUR');

  protected readonly width = observeWidth();
  protected readonly height = HEIGHT;
  protected readonly m = M;
  protected readonly innerH = HEIGHT - M.top - M.bottom;
  protected readonly colors = CHART;
  protected readonly hovered = signal<number | null>(null);

  protected readonly geometry = computed(() => {
    const months = this.months();
    const width = this.width();
    const innerW = width - M.left - M.right;
    const max = Math.max(
      1,
      ...months.flatMap((m) => [Number(m.purchases), Number(m.saleProceeds)]),
    );
    const ticks = niceTicks(0, max);
    const y = linearScale([0, ticks[ticks.length - 1]], [M.top + this.innerH, M.top]);
    const band = innerW / Math.max(1, months.length);
    const groupW = Math.min(band * 0.72, 64);
    const barW = (groupW - 2) / 2;
    const labelEvery = Math.ceil(months.length / Math.max(1, Math.floor(innerW / 56)));

    return {
      ticks: ticks.map((v) => ({ value: v, y: y(v), label: compactMoney(v, this.currency()) })),
      bars: months.map((m, i) => {
        const bandX = M.left + i * band;
        const cx = bandX + band / 2;
        const x0 = cx - groupW / 2;
        const buyY = y(Number(m.purchases));
        const sellY = y(Number(m.saleProceeds));
        const baseline = M.top + this.innerH;
        const label = monthLabel.format(new Date(`${m.month}-01T00:00:00Z`));
        return {
          month: m.month,
          bandX,
          bandW: band,
          cx,
          label,
          showLabel: i % labelEvery === 0,
          // 2px surface gap between the two bars of a month.
          buyPath: roundedTopBar(x0, buyY, barW, baseline - buyY),
          sellPath: roundedTopBar(x0 + barW + 2, sellY, barW, baseline - sellY),
          aria: `${label}: αγορές ${money(m.purchases, this.currency())}, πωλήσεις ${money(m.saleProceeds, this.currency())}`,
        };
      }),
    };
  });

  protected readonly tooltip = computed(() => {
    const i = this.hovered();
    if (i === null) return null;
    const m = this.months()[i];
    const bar = this.geometry().bars[i];
    if (!m || !bar) return null;
    const c = this.currency();
    const rows: [string, string][] = [
      ['Αγορές', `${money(m.purchases, c)} (${m.buys})`],
      ['Πωλήσεις', `${money(m.saleProceeds, c)} (${m.sells})`],
      ['Αποτέλεσμα πωλήσεων', money(m.realisedPnl, c)],
      ['Καταθέσεις', money(m.deposits, c)],
    ];
    if (Number(m.withdrawals)) rows.push(['Αναλήψεις', money(m.withdrawals, c)]);
    if (Number(m.dividends)) rows.push(['Μερίσματα', money(m.dividends, c)]);
    if (Number(m.interest)) rows.push(['Τόκοι', money(m.interest, c)]);
    rows.push(['Χρεώσεις', money(m.fees, c)]);
    const tooltipWidth = 224;
    const left = Math.min(Math.max(0, bar.cx + 12), this.width() - tooltipWidth);
    return { title: monthLong.format(new Date(`${m.month}-01T00:00:00Z`)), rows, left };
  });
}
