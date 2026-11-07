import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AccountDto, CostMethod, InstrumentTimelineDto, TimelineDto } from '@t212/shared';
import { date, money, qty, sumMoney, ticker } from '../../core/format';
import { InstrumentChart } from './instrument-chart';
import { MonthlyChart } from './monthly-chart';

@Component({
  selector: 'app-timeline-page',
  imports: [RouterLink, MonthlyChart, InstrumentChart],
  templateUrl: './timeline.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelinePage {
  readonly id = input.required<string>();

  protected readonly account = httpResource<AccountDto>(() => `/api/accounts/${this.id()}`);
  protected readonly currency = computed(() =>
    this.account.hasValue() ? this.account.value().accountCurrency : 'EUR',
  );

  protected readonly method = signal<CostMethod>('AVERAGE');
  protected readonly timeline = httpResource<TimelineDto>(() => ({
    url: `/api/accounts/${this.id()}/timeline`,
    params: { method: this.method() },
  }));

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
