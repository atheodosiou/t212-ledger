import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ExportCheckDto, ExportStateDto } from '@t212/shared';
import { dateTime } from '../core/format';

const KIND_LABEL: Record<ExportCheckDto['differences'][number]['kind'], string> = {
  'missing-from-api': 'Λείπει από το API',
  'missing-from-export': 'Λείπει από το export',
  mismatch: 'Διαφέρει',
};

/**
 * One-line status for the account header: is every record identical to Trading 212's
 * own CSV export of the account? Practice accounts have no export and show nothing.
 */
@Component({
  selector: 'app-export-check-status',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @let s = state();
    @let c = check();
    @if (s?.running; as r) {
      <span class="inline-flex items-center gap-1 text-muted">
        · <span class="size-2 animate-pulse rounded-full bg-brand"></span> Λήψη export
        {{ r.year }} από το Trading 212…
      </span>
    } @else if (s?.blocked?.reason === 'permission' || s?.blocked?.reason === 'error') {
      <span class="text-amber-700" [title]="s!.blocked!.message"
        >· ⚠ Χωρίς export του Trading 212</span
      >
    } @else if (c) {
      @if (c.ok) {
        <span
          class="text-gain"
          [title]="
            'Κάθε εγγραφή ίδια με το export του Trading 212: ' +
            c.compared.orders +
            ' εκτελέσεις, ' +
            c.compared.dividends +
            ' μερίσματα, ' +
            c.compared.cash +
            ' κινήσεις μετρητών. Έλεγχος ' +
            dateTime(c.checkedAt)
          "
          >· ✓ Ίδιο με το export ({{ total() }} εγγραφές)</span
        >
      } @else {
        <a
          [routerLink]="['/accounts', accountId()]"
          fragment="export-check"
          class="font-medium text-loss hover:underline"
        >
          · ⚠ {{ count() }} {{ count() === 1 ? 'διαφορά' : 'διαφορές' }} με το export
        </a>
      }
    }
  `,
})
export class ExportCheckStatus {
  readonly check = input<ExportCheckDto | null>(null);
  readonly state = input<ExportStateDto | null>(null);
  readonly accountId = input.required<string>();
  protected readonly count = computed(
    () => (this.check()?.differences.length ?? 0) + (this.check()?.truncated ?? 0),
  );
  protected readonly total = computed(() => {
    const c = this.check()?.compared;
    return c ? (c.orders + c.dividends + c.cash).toLocaleString('el-GR') : '';
  });
  protected readonly dateTime = dateTime;
}

/** The differences, or why there is no export, on the overview. */
@Component({
  selector: 'app-export-check-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', id: 'export-check' },
  template: `
    @let s = state();
    @let c = check();
    @if (s?.blocked && s!.blocked!.reason !== 'demo') {
      <section class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <h2 class="font-semibold">Δεν υπάρχει export του Trading 212</h2>
        <p class="mt-1">{{ s!.blocked!.message }}</p>
        <p class="mt-2 text-xs">
          Χωρίς αυτό, ο φόρος που παρακρατήθηκε από μερίσματα σε ξένο νόμισμα είναι εκτίμηση, και οι
          επιστροφές φόρου φαίνονται ως καταθέσεις.
        </p>
      </section>
    } @else if (c && !c.ok) {
      <section
        class="rounded-xl border border-loss/30 bg-loss/5 p-4 text-sm"
        aria-labelledby="export-check-title"
      >
        <h2 id="export-check-title" class="font-semibold text-loss">
          Το ιστορικό δεν είναι ίδιο με το export του Trading 212
        </h2>
        <p class="mt-1 text-xs text-muted">
          Σύγκριση εγγραφή προς εγγραφή, {{ dateTime(c.from) }} – {{ dateTime(c.to) }}. Μέχρι να
          λυθεί, οι αναφορές μπορεί να μην είναι ακριβείς. Δοκίμασε πρώτα έναν συγχρονισμό.
        </p>
        <ul class="mt-3 space-y-1.5">
          @for (d of c.differences; track $index) {
            <li class="flex flex-wrap gap-x-2">
              <span class="tabular-nums text-muted">{{ d.date }}</span>
              <span class="font-medium">{{ kindLabel[d.kind] }}:</span>
              <span>{{ d.what }}</span>
              <span class="text-muted">— {{ d.detail }}</span>
            </li>
          }
        </ul>
        @if (c.truncated) {
          <p class="mt-2 text-xs text-muted">…και {{ c.truncated }} ακόμα.</p>
        }
      </section>
    }
  `,
})
export class ExportCheckPanel {
  readonly check = input<ExportCheckDto | null>(null);
  readonly state = input<ExportStateDto | null>(null);
  protected readonly kindLabel = KIND_LABEL;
  protected readonly dateTime = dateTime;
}
