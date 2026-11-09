import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { MilestoneDto } from '@t212/shared';
import { date, money, sumMoney, TIME_ZONE } from '../../core/format';

const SHOWN_MONTHS = 6;

const monthKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
});
const monthLong = new Intl.DateTimeFormat('el-GR', {
  timeZone: TIME_ZONE,
  month: 'long',
  year: 'numeric',
});

interface MonthGroup {
  key: string;
  title: string;
  /** First deposit, first dividend, withdrawals. */
  notes: MilestoneDto[];
  /** Positions opened this month and still open at its end, once each. */
  opened: MilestoneDto[];
  /** Positions opened in an earlier month and closed in this one. */
  closed: MilestoneDto[];
  /** Positions opened and closed within the month. */
  quick: { tickers: string[]; count: number; pnl: string };
}

/**
 * The moments of the journey, month by month. Positions opened and closed within the
 * same month (quick trades) are summed into one line, so a busy month stays readable.
 */
export function groupMilestones(milestones: MilestoneDto[]): MonthGroup[] {
  const byMonth = new Map<string, MilestoneDto[]>();
  for (const m of milestones) {
    const key = monthKey.format(new Date(m.date)).slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), m]);
  }
  const id = (m: MilestoneDto) => m.isin ?? m.ticker ?? '';
  /** Instruments held in an earlier month: opening one again says so. */
  const heldBefore = new Set<string>();
  return [...byMonth.entries()].map(([key, items]) => {
    const open = new Map<string, MilestoneDto>();
    const closed: MilestoneDto[] = [];
    const quickPnl: string[] = [];
    const quickTickers = new Set<string>();
    let quickCount = 0;
    for (const m of items) {
      if (m.kind === 'NEW_POSITION') {
        if (!open.has(id(m))) open.set(id(m), m);
      } else if (m.kind === 'CLOSED') {
        if (open.has(id(m))) {
          open.delete(id(m));
          quickCount++;
          quickPnl.push(m.realisedPnl ?? '0');
          if (m.ticker) quickTickers.add(m.ticker);
        } else closed.push(m);
      }
    }
    const opened = [...open.values()].map((m) => ({ ...m, again: heldBefore.has(id(m)) }));
    for (const m of items) if (m.kind === 'NEW_POSITION') heldBefore.add(id(m));
    return {
      key,
      title: monthLong.format(new Date(items[0].date)),
      notes: items.filter((m) => m.kind !== 'NEW_POSITION' && m.kind !== 'CLOSED'),
      opened,
      closed,
      quick: { tickers: [...quickTickers], count: quickCount, pnl: sumMoney(quickPnl) },
    };
  });
}

@Component({
  selector: 'app-journey-milestones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol class="relative ml-1 border-l border-line pl-5">
      @for (g of visible(); track g.key) {
        <li class="pb-5 last:pb-0">
          <span
            class="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-surface bg-brand"
            aria-hidden="true"
          ></span>
          <h3 class="text-sm font-semibold capitalize">{{ g.title }}</h3>
          <ul class="mt-1 space-y-1 text-sm">
            @for (m of g.notes; track $index) {
              <li class="flex gap-2">
                @switch (m.kind) {
                  @case ('FIRST_DEPOSIT') {
                    <span class="w-4 shrink-0 text-center text-brand" aria-hidden="true">●</span>
                    <span
                      >Πρώτη κατάθεση: <strong>{{ money(m.amount, currency()) }}</strong></span
                    >
                  }
                  @case ('FIRST_DIVIDEND') {
                    <span class="w-4 shrink-0 text-center text-gain" aria-hidden="true">◆</span>
                    <span>
                      Πρώτο μέρισμα:
                      <button
                        type="button"
                        class="font-medium hover:underline"
                        (click)="pick.emit(m.isin)"
                      >
                        {{ m.ticker }}</button
                      >, {{ money(m.amount, currency()) }}
                    </span>
                  }
                  @case ('WITHDRAWAL') {
                    <span class="w-4 shrink-0 text-center text-muted" aria-hidden="true">↑</span>
                    <span>Ανάληψη {{ money(m.amount, currency()) }}</span>
                  }
                }
              </li>
            }
            @if (g.opened.length) {
              <li class="flex gap-2">
                <span class="w-4 shrink-0 text-center text-[#2a78d6]" aria-hidden="true">▲</span>
                <span>
                  {{ g.opened.length === 1 ? 'Νέα θέση' : 'Νέες θέσεις' }}:
                  @for (m of g.opened; track $index; let last = $last) {
                    <button
                      type="button"
                      class="font-medium hover:underline"
                      [title]="m.instrumentName ?? ''"
                      (click)="pick.emit(m.isin)"
                    >
                      {{ m.ticker }}</button
                    >{{ m.again ? ' (ξανά)' : '' }}{{ last ? '' : ', ' }}
                  }
                </span>
              </li>
            }
            @for (m of g.closed; track $index) {
              <li class="flex gap-2">
                <span class="w-4 shrink-0 text-center text-[#eb6834]" aria-hidden="true">▼</span>
                <span>
                  Έκλεισες τη θέση
                  <button
                    type="button"
                    class="font-medium hover:underline"
                    (click)="pick.emit(m.isin)"
                  >
                    {{ m.ticker }}
                  </button>
                  <span
                    class="font-medium"
                    [class.text-gain]="Number(m.realisedPnl) > 0"
                    [class.text-loss]="Number(m.realisedPnl) < 0"
                  >
                    {{ signed(m.realisedPnl) }}</span
                  >
                </span>
              </li>
            }
            @if (g.quick.count) {
              <li class="flex gap-2">
                <span class="w-4 shrink-0 text-center text-muted" aria-hidden="true">⇄</span>
                <span>
                  {{ g.quick.count }}
                  {{
                    g.quick.count === 1 ? 'θέση άνοιξε και έκλεισε' : 'θέσεις άνοιξαν και έκλεισαν'
                  }}
                  μέσα στον μήνα:
                  <span
                    class="font-medium"
                    [class.text-gain]="Number(g.quick.pnl) > 0"
                    [class.text-loss]="Number(g.quick.pnl) < 0"
                    >{{ signed(g.quick.pnl) }}</span
                  >
                  <span class="block text-xs text-muted">{{ g.quick.tickers.join(', ') }}</span>
                </span>
              </li>
            }
          </ul>
        </li>
      }
    </ol>
    @if (groups().length > shown()) {
      <button
        type="button"
        (click)="shown.set(groups().length)"
        class="mt-4 min-h-10 rounded-lg border border-line px-4 text-sm font-medium hover:bg-canvas"
      >
        Όλη η διαδρομή ({{ groups().length - shown() }} μήνες ακόμα)
      </button>
    }
  `,
})
export class JourneyMilestones {
  readonly milestones = input.required<MilestoneDto[]>();
  readonly currency = input('EUR');
  /** An instrument was picked (its ISIN). */
  readonly pick = output<string | null>();

  protected readonly shown = signal(SHOWN_MONTHS);
  protected readonly groups = computed(() => groupMilestones(this.milestones()));
  protected readonly visible = computed(() => this.groups().slice(0, this.shown()));

  protected readonly money = money;
  protected readonly date = date;
  protected readonly Number = Number;

  protected signed(value: string | null): string {
    const text = money(value, this.currency());
    return Number(value) > 0 ? `+${text}` : text;
  }
}
