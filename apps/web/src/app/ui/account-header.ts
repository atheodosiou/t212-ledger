import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AccountState } from '../core/account-state';
import { Api } from '../core/api';
import { dateTime, SYNC_LABEL } from '../core/format';
import { Toasts } from '../core/toasts';
import { ExportCheckStatus } from './export-check';
import { ReconciliationStatus } from './reconciliation';

export type AccountSection = 'overview' | 'accountant' | 'timeline';

/** Account title, sync status, section navigation and the sync button. Lives in the sticky top of every account page. */
@Component({
  selector: 'app-account-header',
  imports: [RouterLink, ReconciliationStatus, ExportCheckStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let acc = state().value();
    <a
      routerLink="/"
      class="-ml-1 inline-flex min-h-8 items-center px-1 pt-2 text-sm text-muted hover:text-ink"
      >‹ Λογαριασμοί</a
    >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 class="min-w-0 truncate text-xl font-semibold tracking-tight">
            {{ acc?.label ?? '…' }}
          </h1>
          @if (acc) {
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
              [class]="
                acc.environment === 'DEMO'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              "
            >
              {{ acc.environment === 'DEMO' ? 'Practice' : 'Πραγματικά χρήματα' }}
            </span>
          }
        </div>
        <p
          class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted"
          aria-live="polite"
        >
          @if (state().syncing()) {
            <span class="size-2 animate-pulse rounded-full bg-brand"></span>
            {{ syncLabel[acc!.syncStatus] }}
          } @else if (acc?.syncStatus === 'FAILED') {
            <span class="text-loss">Ο συγχρονισμός απέτυχε: {{ acc?.syncError }}</span>
          } @else if (acc?.lastSyncedAt) {
            Ενημερώθηκε {{ dateTime(acc!.lastSyncedAt!) }}
            <app-reconciliation-status [check]="acc!.reconciliation" [accountId]="accountId()" />
            <app-export-check-status
              [check]="acc!.exportCheck"
              [state]="acc!.exportState"
              [accountId]="accountId()"
            />
          }
        </p>
      </div>
      <button
        type="button"
        (click)="syncNow()"
        [disabled]="!acc || state().syncing() || requested()"
        aria-label="Συγχρονισμός"
        class="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-sm font-medium transition hover:border-brand/40 disabled:opacity-50 sm:flex sm:size-auto sm:gap-1.5 sm:px-3 sm:py-2"
      >
        <span aria-hidden="true">↻</span>
        <span class="hidden sm:inline" aria-hidden="true">Συγχρονισμός</span>
      </button>
    </div>
    <!-- Three equal tabs on a phone; side by side from tablet width. -->
    <nav class="mt-2 grid grid-cols-3 sm:flex sm:gap-1" aria-label="Ενότητες λογαριασμού">
      @for (s of sections; track s.id) {
        <a
          [routerLink]="s.path(accountId())"
          [attr.aria-current]="active() === s.id ? 'page' : null"
          class="-mb-px flex min-h-11 items-center justify-center whitespace-nowrap border-b-2 px-2 text-sm font-medium transition sm:px-3"
          [class]="
            active() === s.id
              ? 'border-brand text-ink'
              : 'border-transparent text-muted hover:text-ink'
          "
        >
          <span class="sm:hidden">{{ s.short }}</span>
          <span class="hidden sm:inline">{{ s.label }}</span>
        </a>
      }
    </nav>
  `,
})
export class AccountHeader {
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);

  readonly state = input.required<AccountState>();
  readonly accountId = input.required<string>();
  readonly active = input.required<AccountSection>();

  protected readonly requested = signal(false);

  protected readonly sections: {
    id: AccountSection;
    label: string;
    /** For a phone, where three tabs share the width. */
    short: string;
    path: (id: string) => string[];
  }[] = [
    { id: 'overview', label: 'Επισκόπηση', short: 'Επισκόπηση', path: (id) => ['/accounts', id] },
    {
      id: 'accountant',
      label: 'Για τον λογιστή',
      short: 'Λογιστής',
      path: (id) => ['/accounts', id, 'accountant'],
    },
    {
      id: 'timeline',
      label: 'Χρονολόγιο',
      short: 'Χρονολόγιο',
      path: (id) => ['/accounts', id, 'timeline'],
    },
  ];

  protected async syncNow(): Promise<void> {
    this.requested.set(true);
    try {
      await this.api.sync(this.accountId());
      this.state().account.reload();
    } catch (error) {
      this.toasts.error('Ο συγχρονισμός δεν ξεκίνησε', error, () => this.syncNow());
    } finally {
      this.requested.set(false);
    }
  }

  protected readonly syncLabel = SYNC_LABEL;
  protected readonly dateTime = dateTime;
}
