import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ReconciliationDto } from '@t212/shared';
import { dateTime, money } from '../core/format';

/** One-line status for the account header: does our history match Trading 212? */
@Component({
  selector: 'app-reconciliation-status',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (check(); as c) {
      @if (c.ok) {
        <span
          class="inline-flex items-center gap-1 text-gain"
          [title]="
            'Έλεγχος ' +
            dateTime(c.checkedAt) +
            ': ' +
            c.compared.positions +
            ' θέσεις και μετρητά ' +
            money(c.compared.cashBroker) +
            ' ίδια με το Trading 212'
          "
        >
          · ✓ Συμφωνεί με το Trading 212
          @if (c.stale) {
            <span class="text-muted">(νέος έλεγχος στο επόμενο sync)</span>
          }
        </span>
      } @else {
        <a
          [routerLink]="['/accounts', accountId()]"
          fragment="checks"
          class="inline-flex items-center gap-1 font-medium text-loss hover:underline"
        >
          · ⚠ {{ errors() }} {{ errors() === 1 ? 'διαφορά' : 'διαφορές' }} με το Trading 212
        </a>
      }
    }
  `,
})
export class ReconciliationStatus {
  readonly check = input<ReconciliationDto | null>(null);
  readonly accountId = input.required<string>();
  protected readonly errors = computed(
    () => this.check()?.issues.filter((i) => i.severity === 'error').length ?? 0,
  );
  protected readonly dateTime = dateTime;
  protected readonly money = money;
}

/** The issues themselves, shown on the overview when there are any. */
@Component({
  selector: 'app-reconciliation-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', id: 'checks' },
  template: `
    @if (check(); as c) {
      @if (c.issues.length) {
        <section
          class="rounded-xl border p-4 text-sm"
          [class]="
            c.ok
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-loss/30 bg-loss/5 text-ink'
          "
          aria-labelledby="checks-title"
        >
          <h2 id="checks-title" class="font-semibold" [class.text-loss]="!c.ok">
            @if (c.ok) {
              Ο έλεγχος με το Trading 212 πέρασε, με {{ c.issues.length }}
              {{ c.issues.length === 1 ? 'σημείωση' : 'σημειώσεις' }}
            } @else {
              Το ιστορικό δεν συμφωνεί με το Trading 212
            }
          </h2>
          @if (!c.ok) {
            <p class="mt-1 text-xs text-muted">
              Τα νούμερα αυτής της σελίδας, των αναφορών και των exports μπορεί να είναι λάθος μέχρι
              να λυθεί. Δοκίμασε πρώτα έναν συγχρονισμό.
            </p>
          }
          <ul class="mt-3 space-y-1.5">
            @for (issue of c.issues; track $index) {
              <li class="flex gap-2">
                <span aria-hidden="true">{{ issue.severity === 'error' ? '✗' : '!' }}</span>
                <span class="sr-only">{{
                  issue.severity === 'error' ? 'Σφάλμα:' : 'Σημείωση:'
                }}</span>
                <span>{{ issue.message }}</span>
              </li>
            }
          </ul>
          <p class="mt-3 text-[11px] text-muted">Έλεγχος {{ dateTime(c.checkedAt) }}</p>
        </section>
      }
    }
  `,
})
export class ReconciliationPanel {
  readonly check = input<ReconciliationDto | null>(null);
  protected readonly dateTime = dateTime;
}
