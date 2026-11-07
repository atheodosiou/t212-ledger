import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AccountDto, SyncStage } from '@t212/shared';

interface Step {
  stage: SyncStage;
  label: string;
  count?: (p: NonNullable<AccountDto['syncProgress']>) => number;
  unit?: string;
}

const STEPS: Step[] = [
  { stage: 'ORDERS', label: 'Συναλλαγές', count: (p) => p.orders, unit: 'εκτελέσεις' },
  { stage: 'DIVIDENDS', label: 'Μερίσματα', count: (p) => p.dividends, unit: 'μερίσματα' },
  {
    stage: 'TRANSACTIONS',
    label: 'Καταθέσεις, τόκοι, χρεώσεις',
    count: (p) => p.transactions,
    unit: 'κινήσεις',
  },
  { stage: 'INSTRUMENTS', label: 'Ονόματα τίτλων' },
  { stage: 'LEDGER', label: 'Υπολογισμός κόστους και αποτελεσμάτων' },
];

/**
 * Shows what a running sync is doing. `full` lists every step (first sync, no data
 * yet); `compact` is a one-line banner above existing data.
 */
@Component({
  selector: 'app-sync-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant() === 'full') {
      <section class="rounded-xl border border-line bg-surface p-5" aria-live="polite">
        <div class="flex items-center gap-3">
          <span class="relative flex size-3">
            <span
              class="absolute inline-flex size-full animate-ping rounded-full bg-brand/40"
            ></span>
            <span class="relative inline-flex size-3 rounded-full bg-brand"></span>
          </span>
          <h2 class="font-semibold">
            {{
              queued() ? 'Ο συγχρονισμός ξεκινά…' : 'Φέρνουμε το ιστορικό σου από το Trading 212'
            }}
          </h2>
        </div>
        <p class="mt-1 text-sm text-muted">
          Την πρώτη φορά διαβάζουμε όλο το ιστορικό, από την πρώτη σου συναλλαγή. Τα δεδομένα θα
          εμφανιστούν εδώ μόλις τελειώσει. Μπορείς να αφήσεις τη σελίδα ανοιχτή ή να επιστρέψεις
          αργότερα.
        </p>

        <ol class="mt-5 space-y-3">
          @for (step of steps(); track step.stage) {
            <li class="flex items-center gap-3 text-sm">
              <span
                class="grid size-6 shrink-0 place-items-center rounded-full text-xs"
                [class]="
                  step.state === 'done'
                    ? 'bg-brand text-white'
                    : step.state === 'active'
                      ? 'border-2 border-brand'
                      : 'border border-line text-muted'
                "
                aria-hidden="true"
              >
                @if (step.state === 'done') {
                  ✓
                } @else if (step.state === 'active') {
                  <span class="size-2 animate-pulse rounded-full bg-brand"></span>
                }
              </span>
              <span
                [class.text-muted]="step.state === 'pending'"
                [class.font-medium]="step.state === 'active'"
              >
                {{ step.label }}
              </span>
              @if (step.detail) {
                <span class="ml-auto tabular-nums text-muted">{{ step.detail }}</span>
              }
              <span class="sr-only">{{ stateLabel[step.state] }}</span>
            </li>
          }
        </ol>

        @if (waitSeconds() !== null) {
          <p class="mt-5 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            Το Trading 212 επιτρέπει λίγες κλήσεις ανά λεπτό. Συνεχίζουμε αυτόματα σε
            <strong class="tabular-nums">{{ waitSeconds() }}″</strong>.
          </p>
        }
      </section>
    } @else {
      <div
        class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand/20 bg-brand/5 px-4 py-2.5 text-sm"
        aria-live="polite"
      >
        <span class="size-2 animate-pulse rounded-full bg-brand"></span>
        <span class="font-medium">Συγχρονισμός σε εξέλιξη</span>
        <span class="text-muted">{{ activeLabel() }}</span>
        @if (waitSeconds() !== null) {
          <span class="text-amber-800">· αναμονή ορίου κλήσεων {{ waitSeconds() }}″</span>
        }
        <span class="ml-auto text-xs text-muted">Τα στοιχεία θα ανανεωθούν μόλις τελειώσει</span>
      </div>
    }
  `,
})
export class SyncProgress {
  readonly account = input.required<AccountDto>();
  readonly variant = input<'full' | 'compact'>('full');
  /** Current time, ticked by the page so the countdown moves. */
  readonly now = input(Date.now());

  protected readonly stateLabel = {
    done: 'ολοκληρώθηκε',
    active: 'σε εξέλιξη',
    pending: 'σε αναμονή',
  };

  protected readonly queued = computed(() => this.account().syncStatus === 'QUEUED');

  protected readonly steps = computed(() => {
    const progress = this.account().syncProgress;
    const current = this.queued()
      ? -1
      : STEPS.findIndex((s) => s.stage === (progress?.stage ?? 'ORDERS'));
    return STEPS.map((step, i) => {
      const state: 'done' | 'active' | 'pending' =
        i < current ? 'done' : i === current ? 'active' : 'pending';
      const count = progress && step.count ? step.count(progress) : null;
      return {
        ...step,
        state,
        detail:
          state !== 'pending' && count !== null
            ? `${count.toLocaleString('el-GR')} ${step.unit}`
            : null,
      };
    });
  });

  protected readonly activeLabel = computed(() => {
    const active = this.steps().find((s) => s.state === 'active');
    if (!active) return 'σε αναμονή…';
    return active.detail ? `${active.label} · ${active.detail}` : active.label;
  });

  protected readonly waitSeconds = computed(() => {
    const until = this.account().syncProgress?.waitingUntil;
    if (!until) return null;
    return Math.max(0, Math.ceil((new Date(until).getTime() - this.now()) / 1000));
  });
}
