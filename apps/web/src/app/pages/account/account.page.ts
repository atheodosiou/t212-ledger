import { httpResource } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { PortfolioDto } from '@t212/shared';
import { accountState } from '../../core/account-state';
import { apiErrorMessage } from '../../core/format';
import { whileActive } from '../../core/poll';
import { AccountHeader } from '../../ui/account-header';
import { ReconciliationPanel } from '../../ui/reconciliation';
import { SyncProgress } from '../../ui/sync-progress';
import { StickyTop } from '../../ui/table';
import { PortfolioSummary } from './portfolio-summary';
import { PositionsTable } from './positions-table';
import { SummaryBar } from './summary-bar';

const LIVE_REFRESH_MS = 60_000;

/** Overview: what the account is worth now, the total result and its breakdown, open positions. */
@Component({
  selector: 'app-account-page',
  imports: [
    AccountHeader,
    StickyTop,
    SyncProgress,
    PortfolioSummary,
    SummaryBar,
    PositionsTable,
    ReconciliationPanel,
  ],
  templateUrl: './account.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPage {
  /** Route parameter, bound by withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly state = accountState(() => this.id());

  protected readonly portfolio = httpResource<PortfolioDto>(() => {
    this.state.syncedAt(); // refetch once a sync finishes
    return `/api/accounts/${this.id()}/portfolio`;
  });
  protected readonly portfolioValue = computed(() =>
    this.portfolio.hasValue() ? this.portfolio.value() : null,
  );
  protected readonly portfolioError = computed(() =>
    this.portfolio.error() && !this.portfolio.hasValue()
      ? apiErrorMessage(
          this.portfolio.error(),
          'Δεν ήταν δυνατή η λήψη live δεδομένων από το Trading 212.',
        )
      : null,
  );

  /** A first sync has nothing to show yet; later syncs keep the page and mark it as updating. */
  protected readonly firstSync = computed(
    () => this.state.syncing() && !this.state.value()?.lastSyncedAt,
  );

  /** True once the top cards have scrolled under the sticky header. */
  protected readonly collapsed = signal(false);
  private readonly summary = viewChild<ElementRef<HTMLElement>>('summary');

  constructor() {
    whileActive(
      () => !this.state.syncing(),
      LIVE_REFRESH_MS,
      () => {
        if (document.visibilityState === 'visible') this.portfolio.reload();
      },
    );

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      let frame = 0;
      const update = () => {
        frame = 0;
        const cards = this.summary()?.nativeElement;
        const header = document.querySelector('app-account-header');
        if (!cards || !header) return;
        // Measured against the account header, not the whole sticky block, so the bar
        // appearing (and making the block taller) cannot flip the state back.
        const headerBottom = header.getBoundingClientRect().bottom;
        const rect = cards.getBoundingClientRect();
        this.collapsed.set(rect.top + rect.height / 2 < headerBottom);
      };
      const onScroll = () => {
        if (!frame) frame = requestAnimationFrame(update);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        if (frame) cancelAnimationFrame(frame);
      });
    });
  }

  protected expand(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
