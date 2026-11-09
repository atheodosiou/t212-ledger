import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { YearOverviewDto, YearTotalsDto } from '@t212/shared';
import { dateTime, money } from '../../core/format';
import { toastOnError } from '../../core/toasts';
import { COST_PARTS } from '../insights/insights.page';
import { holdingLabel } from '../insights/holding-scatter';

const monthShort = new Intl.DateTimeFormat('el-GR', { month: 'short', timeZone: 'UTC' });
/** With the year: alone, the month comes out in the genitive ("Μαΐου"). */
const monthLong = new Intl.DateTimeFormat('el-GR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const asDate = (month: string) => new Date(`${month}-01T00:00:00Z`);

type Tile = {
  label: string;
  value: string;
  note?: string;
  delta?: string | null;
  tone?: 'gain' | 'loss' | null;
};

/** One year of investing on a page, ready to save as PDF. */
@Component({
  selector: 'app-year-page',
  imports: [RouterLink],
  templateUrl: './year.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YearPage {
  /** null: the latest year with activity, as the API picks it. */
  protected readonly year = signal<number | null>(null);
  protected readonly review = httpResource<YearOverviewDto>(() => ({
    url: '/api/year',
    params: this.year() ? { year: this.year()! } : undefined,
  }));

  constructor() {
    toastOnError(this.review, 'Η χρονιά δεν φόρτωσε');
  }

  protected readonly tiles = computed<Tile[]>(() => {
    if (!this.review.hasValue()) return [];
    const r = this.review.value();
    const t = r.totals;
    const p = r.previous;
    const tone = (v: string) => (Number(v) > 0 ? 'gain' : Number(v) < 0 ? 'loss' : null);
    const tiles: Tile[] = [
      {
        label: 'Κατέθεσες',
        value: money(t.deposits),
        note: Number(t.withdrawals) ? `αναλήψεις ${money(t.withdrawals)}` : undefined,
        delta: this.delta(t, p, 'deposits'),
      },
      {
        label: 'Αγόρασες',
        value: money(t.purchases),
        note: `${t.buys} αγορές`,
        delta: this.delta(t, p, 'purchases'),
      },
      {
        label: 'Πούλησες',
        value: money(t.saleProceeds),
        note: `${t.sells} πωλήσεις`,
        delta: this.delta(t, p, 'saleProceeds'),
      },
      {
        label: 'Αποτέλεσμα πωλήσεων',
        value: money(t.realisedPnl),
        tone: tone(t.realisedPnl),
        note: p ? `${r.year - 1}: ${money(p.realisedPnl)}` : undefined,
      },
      {
        label: 'Μερίσματα',
        value: money(t.dividends),
        note: r.dividends.payers ? `από ${r.dividends.payers} εταιρείες` : undefined,
        delta: this.delta(t, p, 'dividends'),
      },
      { label: 'Τόκοι μετρητών', value: money(t.interest), delta: this.delta(t, p, 'interest') },
      { label: 'Κόστος', value: money(t.costs), delta: this.delta(t, p, 'costs') },
    ];
    if (r.taxDue !== null) tiles.push({ label: 'Φόρος που αναλογεί', value: money(r.taxDue) });
    return tiles;
  });

  protected readonly monthBars = computed(() => {
    if (!this.review.hasValue()) return [];
    const months = this.review.value().habits.months;
    const max = Math.max(1, ...months.map((m) => m.buys + m.sells));
    return months.map((m) => ({
      label: monthShort.format(asDate(m.month)),
      buys: (m.buys / max) * 100,
      sells: (m.sells / max) * 100,
      title: `${monthLong.format(asDate(m.month))}: ${m.buys} αγορές, ${m.sells} πωλήσεις`,
    }));
  });

  protected readonly costParts = COST_PARTS;
  protected readonly money = money;
  protected readonly holdingLabel = holdingLabel;
  protected readonly Number = Number;
  protected readonly generatedAt = dateTime(new Date());

  protected monthName(month: string): string {
    return monthLong.format(asDate(month));
  }

  protected costOf(key: (typeof COST_PARTS)[number]['key']): number {
    return this.review.hasValue() ? Number(this.review.value().costs[key]) : 0;
  }

  protected print(): void {
    window.print();
  }

  /** Change from the year before, e.g. "+12% από το 2024"; null when it means nothing. */
  private delta(
    t: YearTotalsDto,
    p: YearTotalsDto | null,
    field: 'deposits' | 'purchases' | 'saleProceeds' | 'dividends' | 'interest' | 'costs',
  ): string | null {
    if (!p) return null;
    const before = Number(p[field]);
    const now = Number(t[field]);
    if (before <= 0) return null;
    const pct = Math.round(((now - before) / before) * 100);
    const year = this.review.value()!.year - 1;
    return pct === 0 ? `ίδιο με το ${year}` : `${pct > 0 ? '+' : ''}${pct}% από το ${year}`;
  }
}
