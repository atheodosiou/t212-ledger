import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type { CostMethod, InstrumentTimelineDto, TimelineDto } from '@t212/shared';
import { accountState } from '../../core/account-state';
import { date, money, qty, sumMoney, ticker } from '../../core/format';
import { AccountHeader } from '../../ui/account-header';
import { SyncProgress } from '../../ui/sync-progress';
import { StickyTop } from '../../ui/table';
import { InstrumentChart } from './instrument-chart';
import { CostMethodPicker } from '../../ui/cost-method-picker';
import { toastOnError } from '../../core/toasts';
import { MonthlyChart } from './monthly-chart';
import { JourneyChart } from './journey-chart';
import { JourneyMilestones } from './journey-milestones';

@Component({
  selector: 'app-timeline-page',
  imports: [
    AccountHeader,
    StickyTop,
    SyncProgress,
    MonthlyChart,
    JourneyChart,
    JourneyMilestones,
    InstrumentChart,
    CostMethodPicker,
  ],
  templateUrl: './timeline.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelinePage {
  readonly id = input.required<string>();

  protected readonly state = accountState(() => this.id());
  protected readonly currency = computed(() => this.state.value()?.accountCurrency ?? 'EUR');

  protected readonly method = signal<CostMethod>('AVERAGE');
  protected readonly timeline = httpResource<TimelineDto>(() => {
    this.state.syncedAt(); // refetch once a sync finishes
    return { url: `/api/accounts/${this.id()}/timeline`, params: { method: this.method() } };
  });

  constructor() {
    toastOnError(this.timeline, 'Το χρονολόγιο δεν φόρτωσε');
  }

  protected readonly instruments = computed(() =>
    this.timeline.hasValue() ? this.timeline.value().instruments : [],
  );
  protected readonly selectedKey = linkedSignal<InstrumentTimelineDto[], string | null>({
    source: this.instruments,
    computation: (list, previous) =>
      previous?.value && list.some((i) => key(i) === previous.value)
        ? previous.value
        : list[0]
          ? key(list[0])
          : null,
  });
  protected readonly selected = computed(
    () => this.instruments().find((i) => key(i) === this.selectedKey()) ?? null,
  );

  protected readonly selectedStats = computed(() => {
    const item = this.selected();
    if (!item) return null;
    const trades = item.events.filter((e) => e.pricePerShare !== null);
    const buys = trades.filter((e) => e.kind === 'BUY');
    const last = item.events[item.events.length - 1];
    return {
      buys: buys.length,
      sells: trades.length - buys.length,
      realised: sumMoney(trades.map((e) => e.realisedPnl)),
      averageCost: last?.averageCost ?? null,
      firstBuy: buys[0]?.date ?? null,
    };
  });

  protected readonly showMonthTable = signal(false);

  /** From a milestone: show that instrument's history below. */
  protected pickInstrument(isin: string | null): void {
    if (!isin || !this.instruments().some((i) => key(i) === isin)) return;
    this.selectedKey.set(isin);
    document.getElementById('instrument')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected readonly key = key;
  protected readonly money = money;
  protected readonly qty = qty;
  protected readonly date = date;
  protected readonly ticker = ticker;
  protected readonly Number = Number;
  protected readonly monthName = (month: string) =>
    new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${month}-01T00:00:00Z`),
    );
}

function key(item: InstrumentTimelineDto): string {
  return item.isin ?? item.ticker;
}
