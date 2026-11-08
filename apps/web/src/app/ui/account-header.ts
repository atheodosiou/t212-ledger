import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AccountState } from '../core/account-state';
import { Api } from '../core/api';
import { apiErrorMessage, dateTime, SYNC_LABEL } from '../core/format';

export type AccountSection = 'overview' | 'accountant' | 'timeline';

/** Account title, sync status, section navigation and the sync button. Lives in the sticky top of every account page. */
@Component({
  selector: 'app-account-header',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let acc = state().value();
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3">
      <div class="min-w-0">
        <a routerLink="/" class="text-xs text-muted hover:text-ink">‹ Λογαριασμοί</a>
        <div class="flex items-center gap-2">
          <h1 class="truncate text-xl font-semibold tracking-tight">{{ acc?.label ?? '…' }}</h1>
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
        <p class="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
          @if (state().syncing()) {
            <span class="size-2 animate-pulse rounded-full bg-brand"></span>
            {{ syncLabel[acc!.syncStatus] }}
          } @else if (acc?.syncStatus === 'FAILED') {
            <span class="text-loss">Ο συγχρονισμός απέτυχε: {{ acc?.syncError }}</span>
          } @else if (acc?.lastSyncedAt) {
            Ενημερώθηκε {{ dateTime(acc!.lastSyncedAt!) }}
          }
        </p>
      </div>
      <button
        type="button"
        (click)="syncNow()"
        [disabled]="!acc || state().syncing() || requested()"
        class="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium transition hover:border-brand/40 disabled:opacity-50"
      >
        ↻ Συγχρονισμός
      </button>
    </div>
    @if (error()) {
      <p role="alert" class="mt-2 rounded-lg bg-loss/5 p-2 text-sm text-loss">{{ error() }}</p>
    }
    <nav class="mt-2 flex gap-1 overflow-x-auto" aria-label="Ενότητες λογαριασμού">
      @for (s of sections; track s.id) {
        <a
          [routerLink]="s.path(accountId())"
          [attr.aria-current]="active() === s.id ? 'page' : null"
          class="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition"
          [class]="
            active() === s.id
              ? 'border-brand text-ink'
              : 'border-transparent text-muted hover:text-ink'
          "
        >
          {{ s.label }}
        </a>
      }
    </nav>
  `,
})
export class AccountHeader {
  private readonly api = inject(Api);

  readonly state = input.required<AccountState>();
  readonly accountId = input.required<string>();
  readonly active = input.required<AccountSection>();

  protected readonly requested = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly sections: {
    id: AccountSection;
    label: string;
    path: (id: string) => string[];
  }[] = [
    { id: 'overview', label: 'Επισκόπηση', path: (id) => ['/accounts', id] },
    { id: 'accountant', label: 'Για τον λογιστή', path: (id) => ['/accounts', id, 'accountant'] },
    { id: 'timeline', label: 'Χρονολόγιο', path: (id) => ['/accounts', id, 'timeline'] },
  ];

  protected async syncNow(): Promise<void> {
    this.error.set(null);
    this.requested.set(true);
    try {
      await this.api.sync(this.accountId());
      this.state().account.reload();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.requested.set(false);
    }
  }

  protected readonly syncLabel = SYNC_LABEL;
  protected readonly dateTime = dateTime;
}
