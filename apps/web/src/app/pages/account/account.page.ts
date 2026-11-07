import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AccountDto, CostMethod, LedgerEntryDto, LedgerKind, ReportDto } from '@t212/shared';
import { Api, exportUrl } from '../../core/api';
import { whileActive } from '../../core/poll';
import { AccountSkeleton } from '../../ui/account-skeleton';
import { SyncProgress } from '../../ui/sync-progress';
import {
  apiErrorMessage,
  date,
  dateTime,
  isSyncing,
  KIND_LABEL,
  money,
  qty,
  sumMoney,
  SYNC_LABEL,
  taxYear,
  ticker,
} from '../../core/format';

type Tab = 'sales' | 'entries' | 'holdings';

const SUMMARY_FIELDS = [
  'deposits',
  'withdrawals',
  'purchases',
  'saleProceeds',
  'realisedPnl',
  'dividends',
  'interest',
  'fees',
] as const;
type SummaryField = (typeof SUMMARY_FIELDS)[number];

@Component({
  selector: 'app-account-page',
  imports: [RouterLink, SyncProgress, AccountSkeleton],
  templateUrl: './account.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPage {
  private readonly api = inject(Api);

  /** Route parameter, bound by withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly account = httpResource<AccountDto>(() => `/api/accounts/${this.id()}`);
  protected readonly status = computed(() =>
    this.account.hasValue() ? this.account.value().syncStatus : undefined,
  );
  protected readonly syncing = computed(() => isSyncing(this.status()));
  /** Changes only when a sync finishes, so the report is refetched exactly then. */
  private readonly syncedAt = computed(() =>
    this.account.hasValue() ? this.account.value().lastSyncedAt : null,
  );

  protected readonly method = signal<CostMethod>('AVERAGE');
  protected readonly report = httpResource<ReportDto>(() => {
    this.syncedAt();
    return { url: `/api/accounts/${this.id()}/report`, params: { method: this.method() } };
  });

  protected readonly years = computed(() =>
    this.report.hasValue()
      ? this.report
          .value()
          .years.map((y) => y.year)
          .reverse()
      : [],
  );
  /** null = whole history. Defaults to the latest year once the report arrives. */
  protected readonly year = linkedSignal<number[], number | null>({
    source: this.years,
    computation: (years, previous) =>
      previous && (previous.value === null || years.includes(previous.value))
        ? previous.value
        : (years[0] ?? null),
  });

  protected readonly summary = computed(() => {
    if (!this.report.hasValue()) return null;
    const year = this.year();
    const years = this.report.value().years.filter((y) => year === null || y.year === year);
    return Object.fromEntries(
      SUMMARY_FIELDS.map((f) => [f, sumMoney(years.map((y) => y[f]))]),
    ) as Record<SummaryField, string>;
  });

  protected readonly sales = computed(() => {
    if (!this.report.hasValue()) return [];
    const year = this.year();
    return this.report.value().sales.filter((s) => year === null || taxYear(s.date) === year);
  });

  /** Our realised result vs Trading 212's own figure, which leaves fees out. */
  protected readonly brokerComparison = computed(() => {
    const sales = this.sales();
    if (!sales.length || sales.some((s) => s.brokerRealisedPnl === null)) return null;
    const ours = sumMoney(sales.map((s) => s.realisedPnl));
    const broker = sumMoney(sales.map((s) => s.brokerRealisedPnl));
    return { ours, broker, difference: sumMoney([broker, String(-Number(ours))]) };
  });

  protected readonly holdings = computed(() => {
    if (!this.report.hasValue()) return [];
    const year = this.year();
    const report = this.report.value();
    const latest = this.years()[0];
    return year === null || year === latest
      ? report.holdings
      : (report.years.find((y) => y.year === year)?.holdingsAtYearEnd ?? []);
  });

  protected readonly warnings = computed(() => {
    if (!this.report.hasValue()) return [];
    const year = this.year();
    return this.report.value().warnings.filter((w) => year === null || taxYear(w.date) === year);
  });

  /** Estimated tax withheld abroad on the period's dividends. */
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
    };
  });

  protected readonly tab = signal<Tab>('sales');
  protected readonly kindFilter = signal<LedgerKind | ''>('');
  protected readonly search = signal('');

  protected readonly entries = httpResource<LedgerEntryDto[]>(() => {
    if (this.tab() !== 'entries') return undefined;
    this.syncedAt();
    const params: Record<string, string> = {};
    const year = this.year();
    if (year !== null) params['year'] = String(year);
    if (this.kindFilter()) params['kind'] = this.kindFilter();
    return { url: `/api/accounts/${this.id()}/ledger`, params };
  });

  protected readonly visibleEntries = computed(() => {
    if (!this.entries.hasValue()) return [];
    const term = this.search().trim().toLowerCase();
    const rows = this.entries.value();
    if (!term) return rows;
    return rows.filter((e) =>
      [e.displayTicker, e.ticker, e.isin, e.instrumentName].some((v) =>
        v?.toLowerCase().includes(term),
      ),
    );
  });

  protected readonly actionError = signal<string | null>(null);
  protected readonly syncRequested = signal(false);

  /** Ticks every second while a rate-limit countdown is shown. */
  protected readonly now = signal(Date.now());

  constructor() {
    // Poll the account until the sync ends; the report and ledger then refetch
    // on their own because they depend on lastSyncedAt.
    whileActive(this.syncing, 2000, () => this.account.reload());
    whileActive(
      () => !!(this.account.hasValue() && this.account.value().syncProgress?.waitingUntil),
      1000,
      () => this.now.set(Date.now()),
    );
  }

  protected async syncNow(full = false): Promise<void> {
    this.actionError.set(null);
    this.syncRequested.set(true);
    try {
      await this.api.sync(this.id(), full);
      this.account.reload();
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    } finally {
      this.syncRequested.set(false);
    }
  }

  protected exportHref(format: 'xlsx' | 'pdf'): string {
    return exportUrl(this.id(), format, this.method(), this.year());
  }

  protected selectYear(value: string): void {
    this.year.set(value === 'all' ? null : Number(value));
  }

  protected readonly summaryTiles: { field: SummaryField; label: string; hint?: string }[] = [
    { field: 'deposits', label: 'Καταθέσεις' },
    { field: 'withdrawals', label: 'Αναλήψεις' },
    { field: 'purchases', label: 'Αγορές', hint: 'με χρεώσεις' },
    { field: 'saleProceeds', label: 'Έσοδα πωλήσεων', hint: 'μετά χρεώσεων' },
    { field: 'dividends', label: 'Μερίσματα', hint: 'καθαρά' },
    { field: 'interest', label: 'Τόκοι' },
    { field: 'fees', label: 'Χρεώσεις', hint: 'FX, κατάθεσης κ.ά.' },
  ];

  protected readonly kinds = Object.entries(KIND_LABEL) as [LedgerKind, string][];
  protected readonly kindLabel = KIND_LABEL;
  protected readonly syncLabel = SYNC_LABEL;
  protected readonly money = money;
  protected readonly qty = qty;
  protected readonly date = date;
  protected readonly dateTime = dateTime;
  protected readonly ticker = ticker;
  protected readonly Number = Number;
}
