import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { CostYearDto, HoldingBucketKey, InsightsDto, JourneyDto } from '@t212/shared';
import { accountState } from '../../core/account-state';
import { money } from '../../core/format';
import { toastOnError } from '../../core/toasts';
import { AccountHeader } from '../../ui/account-header';
import { SyncProgress } from '../../ui/sync-progress';
import { StickyTop } from '../../ui/table';
import { JourneyChart } from '../timeline/journey-chart';
import { HoldingScatter } from './holding-scatter';

const BUCKET_LABEL: Record<HoldingBucketKey, string> = {
  DAY: 'Μέσα στην ημέρα',
  WEEK: 'Έως 1 εβδομάδα',
  MONTH: '1–4 εβδομάδες',
  YEAR: '1–12 μήνες',
  LONGER: 'Πάνω από 1 χρόνο',
};

/** Cost categories, in the order they stack, with their colours. */
export const COST_PARTS = [
  { key: 'currencyConversion', label: 'Μετατροπή νομίσματος', color: '#2a78d6' },
  { key: 'depositFees', label: 'Χρεώσεις καταθέσεων με κάρτα', color: '#eb6834' },
  { key: 'dividendTaxLost', label: 'Φόρος μερισμάτων που χάνεται', color: '#d4a017' },
  { key: 'transactionTaxes', label: 'Φόροι συναλλαγών', color: '#8e5cc4' },
  { key: 'otherFees', label: 'Άλλες χρεώσεις', color: '#b8bec8' },
] as const;

/** Instruments shown at each end of the results chart before "show all". */
const RESULTS_EACH_END = 8;

const regionNames = new Intl.DisplayNames(['el'], { type: 'region' });

@Component({
  selector: 'app-insights-page',
  imports: [AccountHeader, StickyTop, SyncProgress, HoldingScatter, JourneyChart],
  templateUrl: './insights.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsightsPage {
  readonly id = input.required<string>();

  protected readonly state = accountState(() => this.id());
  protected readonly currency = computed(() => this.state.value()?.accountCurrency ?? 'EUR');
  protected readonly insights = httpResource<InsightsDto>(() => {
    this.state.syncedAt(); // refetch once a sync finishes
    return `/api/accounts/${this.id()}/insights`;
  });

  constructor() {
    toastOnError(this.insights, 'Η ανάλυση δεν φόρτωσε');
  }

  protected readonly allResults = signal(false);

  protected readonly results = computed(() => {
    if (!this.insights.hasValue()) return { rows: [], hidden: 0, max: 1 };
    const list = this.insights
      .value()
      .results.instruments.filter((r) => Number(r.realisedPnl) !== 0);
    const max = Math.max(1, ...list.map((r) => Math.abs(Number(r.realisedPnl))));
    if (this.allResults() || list.length <= RESULTS_EACH_END * 2)
      return { rows: list, hidden: 0, max };
    return {
      rows: [...list.slice(0, RESULTS_EACH_END), null, ...list.slice(-RESULTS_EACH_END)],
      hidden: list.length - RESULTS_EACH_END * 2,
      max,
    };
  });

  protected readonly costMax = computed(() =>
    this.insights.hasValue()
      ? Math.max(1, ...this.insights.value().costs.years.map((y) => Number(y.total)))
      : 1,
  );

  /** The currency history in the shape the stacked chart takes. */
  protected readonly currencyJourney = computed<JourneyDto | null>(() => {
    if (!this.insights.hasValue()) return null;
    const e = this.insights.value().exposure;
    return {
      series: e.currencySeries.map((c) => ({ key: c, ticker: c, instrumentName: null })),
      months: e.currencyMonths,
      milestones: [],
    };
  });

  protected readonly bucketLabel = BUCKET_LABEL;
  protected readonly costParts = COST_PARTS;
  protected readonly money = money;
  protected readonly Number = Number;
  protected readonly Math = Math;

  protected country(code: string): string {
    if (code === '—') return 'Άγνωστη';
    try {
      return regionNames.of(code) ?? code;
    } catch {
      return code;
    }
  }

  protected percentOf(part: string, whole: string): string {
    const w = Number(whole);
    return w ? `${((Number(part) / w) * 100).toFixed(2).replace('.', ',')}%` : '—';
  }

  protected costPart(year: CostYearDto, key: (typeof COST_PARTS)[number]['key']): number {
    return Number(year[key]);
  }
}
