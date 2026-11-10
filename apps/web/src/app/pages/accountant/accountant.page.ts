import { httpResource } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type {
  CostMethod,
  HoldingDto,
  LedgerEntryDto,
  LedgerKind,
  LedgerSort,
  RealisedSaleDto,
  ReportDto,
  SaleSort,
  SalesPageDto,
  SortDir,
} from '@t212/shared';
import { accountState } from '../../core/account-state';
import { exportUrl } from '../../core/api';
import {
  date,
  dateTime,
  KIND_LABEL,
  money,
  price,
  qty,
  sumMoney,
  taxYear,
  ticker,
} from '../../core/format';
import { PagedList } from '../../core/paged-list';
import { AccountHeader } from '../../ui/account-header';
import { SyncProgress } from '../../ui/sync-progress';
import { NgTemplateOutlet } from '@angular/common';
import { CostMethodPicker } from '../../ui/cost-method-picker';
import { downloadFile } from '../../core/download';
import { Toasts, toastOnError } from '../../core/toasts';
import { NearEnd, SkeletonRows, SortHeader, StickyTop } from '../../ui/table';
import { E1CodesReference } from '../../ui/e1-codes-reference';
import { ActivatedRoute } from '@angular/router';

type Tab = 'sales' | 'entries' | 'holdings' | 'e1';
/** The link to the Ε1 codes, e.g. from the Taxes page. */
const E1_FRAGMENT = 'e1-codes';
type HoldingSort = 'ticker' | 'quantity' | 'averageCost' | 'costBasis';

const SUMMARY_FIELDS = [
  'deposits',
  'depositFees',
  'withdrawals',
  'purchases',
  'saleProceeds',
  'realisedPnl',
  'dividends',
  'interest',
  'fees',
] as const;
type SummaryField = (typeof SUMMARY_FIELDS)[number];

/** Period figures, tax-relevant tables and the Excel/PDF exports. */
@Component({
  selector: 'app-accountant-page',
  imports: [
    CostMethodPicker,
    AccountHeader,
    StickyTop,
    SyncProgress,
    SortHeader,
    SkeletonRows,
    NearEnd,
    NgTemplateOutlet,
    E1CodesReference,
  ],
  templateUrl: './accountant.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountantPage {
  readonly id = input.required<string>();

  protected readonly state = accountState(() => this.id());
  protected readonly currency = computed(() => this.state.value()?.accountCurrency ?? 'EUR');

  protected readonly method = signal<CostMethod>('AVERAGE');
  protected readonly report = httpResource<ReportDto>(() => {
    this.state.syncedAt();
    // The export brings the exact dividend tax and reclassifies tax refunds.
    this.state.exportedAt();
    return { url: `/api/accounts/${this.id()}/report`, params: { method: this.method() } };
  });
  /** Cards show placeholders while there is nothing (or nothing final) to show. */
  protected readonly cardsLoading = computed(() => this.state.syncing() || !this.report.hasValue());

  protected readonly years = computed(() =>
    this.report.hasValue()
      ? this.report
          .value()
          .years.map((y) => y.year)
          .reverse()
      : [],
  );
  /**
   * null = whole history. Defaults to the latest year. A previous choice is kept only
   * if it was made while years were known: before the report loads the value is just
   * a placeholder, not the user's pick.
   */
  protected readonly year = linkedSignal<number[], number | null>({
    source: this.years,
    computation: (years, previous) =>
      previous &&
      previous.source.length > 0 &&
      (previous.value === null || years.includes(previous.value))
        ? previous.value
        : (years[0] ?? null),
  });

  protected readonly periodLabel = computed(() => {
    const year = this.year();
    return year === null ? 'Όλο το ιστορικό' : `Φορολογικό έτος ${year}`;
  });

  protected readonly summary = computed(() => {
    if (!this.report.hasValue()) return null;
    const year = this.year();
    const years = this.report.value().years.filter((y) => year === null || y.year === year);
    return Object.fromEntries(
      SUMMARY_FIELDS.map((f) => [f, sumMoney(years.map((y) => y[f]))]),
    ) as Record<SummaryField, string>;
  });

  private readonly periodSales = computed(() => {
    if (!this.report.hasValue()) return [];
    const year = this.year();
    return this.report.value().sales.filter((s) => year === null || taxYear(s.date) === year);
  });

  /** Our realised result vs Trading 212's own figure, which leaves fees out. */
  protected readonly brokerComparison = computed(() => {
    const sales = this.periodSales();
    if (!sales.length || sales.some((s) => s.brokerRealisedPnl === null)) return null;
    const ours = sumMoney(sales.map((s) => s.realisedPnl));
    const broker = sumMoney(sales.map((s) => s.brokerRealisedPnl));
    return { broker, difference: sumMoney([broker, String(-Number(ours))]), count: sales.length };
  });

  protected readonly dividendTax = computed(() => {
    if (!this.report.hasValue()) return null;
    const year = this.year();
    const dividends = this.report
      .value()
      .dividends.filter((d) => year === null || taxYear(d.date) === year);
    if (!dividends.length) return null;
    return {
      gross: sumMoney(dividends.map((d) => d.grossAccount ?? d.net)),
      withheld: sumMoney(dividends.map((d) => d.withheld)),
      /** Some figures are estimates (no export of Trading 212 for them). */
      estimated: dividends.some((d) => d.source === 'estimate'),
    };
  });

  protected readonly warnings = computed(() => {
    if (!this.report.hasValue()) return [];
    const year = this.year();
    return this.report.value().warnings.filter((w) => year === null || taxYear(w.date) === year);
  });

  // ── Tables ────────────────────────────────────────────────────────────────

  protected readonly tab = signal<Tab>(
    inject(ActivatedRoute).snapshot.fragment === E1_FRAGMENT ? 'e1' : 'sales',
  );
  protected readonly search = signal('');
  /** `search`, debounced so typing does not fire a request per key. */
  protected readonly query = signal('');
  protected readonly kindFilter = signal<LedgerKind | ''>('');

  protected readonly salesSort = signal<SaleSort>('date');
  protected readonly salesDir = signal<SortDir>('desc');
  protected readonly entriesSort = signal<LedgerSort>('date');
  protected readonly entriesDir = signal<SortDir>('desc');
  protected readonly holdingsSort = signal<HoldingSort>('costBasis');
  protected readonly holdingsDir = signal<SortDir>('desc');

  protected readonly sales = new PagedList<RealisedSaleDto, SalesPageDto>(
    () => {
      if (this.tab() !== 'sales' || this.state.syncing() || !this.report.hasValue()) return null;
      this.state.syncedAt();
      return {
        url: `/api/accounts/${this.id()}/sales`,
        params: {
          method: this.method(),
          year: this.year() ?? undefined,
          q: this.query(),
          sort: this.salesSort(),
          dir: this.salesDir(),
        },
      };
    },
    { errorTitle: 'Οι πωλήσεις δεν φόρτωσαν' },
  );

  protected readonly entries = new PagedList<LedgerEntryDto>(
    () => {
      if (this.tab() !== 'entries' || this.state.syncing() || !this.report.hasValue()) return null;
      this.state.syncedAt();
      this.state.exportedAt();
      return {
        url: `/api/accounts/${this.id()}/ledger`,
        params: {
          year: this.year() ?? undefined,
          kind: this.kindFilter(),
          q: this.query(),
          sort: this.entriesSort(),
          dir: this.entriesDir(),
        },
      };
    },
    { errorTitle: 'Οι κινήσεις δεν φόρτωσαν' },
  );

  protected readonly holdings = computed(() => {
    if (!this.report.hasValue()) return [];
    const year = this.year();
    const report = this.report.value();
    const list: HoldingDto[] =
      year === null || year === this.years()[0]
        ? report.holdings
        : (report.years.find((y) => y.year === year)?.holdingsAtYearEnd ?? []);
    const q = this.query().trim().toLowerCase();
    const key = this.holdingsSort();
    const factor = this.holdingsDir() === 'asc' ? 1 : -1;
    return list
      .filter(
        (h) => !q || [h.ticker, h.isin, h.instrumentName].some((v) => v?.toLowerCase().includes(q)),
      )
      .sort((a, b) =>
        key === 'ticker'
          ? a.ticker.localeCompare(b.ticker) * factor
          : (Number(a[key]) - Number(b[key])) * factor,
      );
  });

  protected readonly holdingsTabLabel = computed(() => {
    const year = this.year();
    return year === null || year === this.years()[0] ? 'Θέσεις σε κόστος' : `Θέσεις 31/12/${year}`;
  });

  constructor() {
    toastOnError(this.report, 'Η αναφορά δεν φόρτωσε');
    if (this.tab() === 'e1')
      afterNextRender(() => {
        // To the tables, with their tabs in view below the sticky header and toolbar.
        const tables = document.getElementById(E1_FRAGMENT)?.parentElement?.closest('section');
        if (!tables) return;
        const header = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
        const bar = document.querySelector<HTMLElement>('[stickyTop]');
        const toolbar =
          bar && getComputedStyle(bar).position === 'sticky'
            ? bar.getBoundingClientRect().height
            : 0;
        window.scrollTo({
          top: tables.getBoundingClientRect().top + window.scrollY - header - toolbar - 12,
        });
      });
    effect((onCleanup) => {
      const value = this.search();
      const timer = setTimeout(() => this.query.set(value.trim()), 300);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected selectYear(value: string): void {
    this.year.set(value === 'all' ? null : Number(value));
  }

  private readonly toasts = inject(Toasts);
  /** The export being generated, if any. */
  protected readonly downloading = signal<'xlsx' | 'pdf' | null>(null);

  /** Builds the report on the server and saves it; a failure is reported with a retry. */
  protected async download(format: 'xlsx' | 'pdf'): Promise<void> {
    if (this.downloading()) return;
    this.downloading.set(format);
    try {
      await downloadFile(
        exportUrl(this.id(), format, this.method(), this.year()),
        `trading212-report.${format}`,
      );
    } catch (error) {
      this.toasts.error(
        format === 'pdf' ? 'Το PDF δεν δημιουργήθηκε' : 'Το Excel δεν δημιουργήθηκε',
        error,
        () => this.download(format),
      );
    } finally {
      this.downloading.set(null);
    }
  }

  protected sortSales(e: { sort: string; dir: SortDir }): void {
    this.salesSort.set(e.sort as SaleSort);
    this.salesDir.set(e.dir);
  }

  protected sortEntries(e: { sort: string; dir: SortDir }): void {
    this.entriesSort.set(e.sort as LedgerSort);
    this.entriesDir.set(e.dir);
  }

  protected sortHoldings(e: { sort: string; dir: SortDir }): void {
    this.holdingsSort.set(e.sort as HoldingSort);
    this.holdingsDir.set(e.dir);
  }

  protected readonly tabs: { id: Tab; label: () => string }[] = [
    { id: 'sales', label: () => 'Πωλήσεις' },
    { id: 'entries', label: () => 'Όλες οι κινήσεις' },
    { id: 'holdings', label: () => this.holdingsTabLabel() },
    { id: 'e1', label: () => 'Κωδικοί Ε1' },
  ];

  protected readonly tiles: { field: SummaryField; label: string; hint?: string }[] = [
    { field: 'deposits', label: 'Καταθέσεις', hint: 'όσα πιστώθηκαν' },
    { field: 'depositFees', label: 'Χρεώσεις κατάθεσης', hint: 'πληρωμή με κάρτα' },
    { field: 'withdrawals', label: 'Αναλήψεις' },
    { field: 'dividends', label: 'Μερίσματα', hint: 'καθαρά' },
    { field: 'interest', label: 'Τόκοι' },
    { field: 'fees', label: 'Χρεώσεις συναλλαγών', hint: 'μετατροπή νομίσματος' },
  ];

  protected readonly kinds = Object.entries(KIND_LABEL) as [LedgerKind, string][];
  protected readonly kindLabel = KIND_LABEL;
  protected readonly money = money;
  protected readonly qty = qty;
  protected readonly price = price;
  protected readonly date = date;
  protected readonly dateTime = dateTime;
  protected readonly ticker = ticker;
  protected readonly Number = Number;
}
