import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import type { CostMethod } from '@t212/shared';

let nextId = 0;

const METHODS: { value: CostMethod; label: string; hint: string }[] = [
  {
    value: 'AVERAGE',
    label: 'Μέση τιμή',
    hint: 'Μέση τιμή κτήσης: κάθε πώληση κοστίζει όσο η μέση τιμή όλων των μετοχών που κρατάς. Αυτή χρησιμοποιεί το Trading 212.',
  },
  {
    value: 'FIFO',
    label: 'FIFO',
    hint: 'FIFO (πρώτη εισαγωγή, πρώτη εξαγωγή): κάθε πώληση κοστίζει όσο οι πρώτες μετοχές που αγόρασες.',
  },
];

/**
 * How the cost of shares sold is counted, with an explanation behind the ⓘ button:
 * a popover opened by click, tap or keyboard (Escape or a click outside closes it),
 * since it has to work on phones too, where there is no hover.
 */
@Component({
  selector: 'app-cost-method-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <fieldset class="text-xs">
      <legend class="flex items-center gap-1 font-medium text-muted">
        Μέθοδος κόστους
        <button
          type="button"
          [attr.popovertarget]="infoId"
          class="info-trigger -my-1 grid size-6 place-items-center rounded-full text-muted transition hover:bg-line/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          aria-label="Τι είναι η μέθοδος κόστους;"
        >
          <svg viewBox="0 0 20 20" class="size-3.5" aria-hidden="true">
            <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M10 9v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            <circle cx="10" cy="6.2" r="1" fill="currentColor" />
          </svg>
        </button>
      </legend>
      <div class="mt-1 inline-flex rounded-lg border border-line bg-surface p-0.5">
        @for (m of methods; track m.value) {
          <button
            type="button"
            (click)="method.set(m.value)"
            [attr.aria-pressed]="method() === m.value"
            [title]="m.hint"
            class="rounded-md px-3 py-1 text-sm transition"
            [class]="method() === m.value ? 'bg-brand text-white' : 'text-muted hover:text-ink'"
          >
            {{ m.label }}
          </button>
        }
      </div>
    </fieldset>

    <div
      [id]="infoId"
      popover
      class="method-info m-0 w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink shadow-lg"
    >
      <h3 class="font-semibold">Πώς μετράει το κόστος μιας πώλησης</h3>
      <p class="mt-1 text-muted">
        Όταν πουλάς, το κέρδος ή η ζημιά είναι η τιμή πώλησης μείον το κόστος των μετοχών που
        πούλησες. Αν τις αγόρασες σε διαφορετικές τιμές, υπάρχουν δύο τρόποι να μετρηθεί αυτό το
        κόστος:
      </p>
      <dl class="mt-3 space-y-2">
        <div>
          <dt class="font-medium">
            Μέση τιμή κτήσης
            <span
              class="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800"
              >αυτή χρησιμοποιεί το Trading 212</span
            >
          </dt>
          <dd class="text-muted">
            Όλες οι μετοχές ενός τίτλου έχουν το ίδιο κόστος: τη μέση τιμή όλων των αγορών. Είναι η
            «Μέση τιμή» που βλέπεις στο Trading 212, και από αυτήν βγαίνει το «Result» κάθε πώλησης.
          </dd>
        </div>
        <div>
          <dt class="font-medium">
            FIFO <span class="font-normal text-muted">(first in, first out)</span>
          </dt>
          <dd class="text-muted">
            Κάθε πώληση «παίρνει» πρώτα τις μετοχές που αγόρασες πρώτες, με την τιμή που τις
            αγόρασες.
          </dd>
        </div>
      </dl>
      <div class="mt-3 rounded-lg bg-canvas p-3 text-xs">
        <p class="font-medium">Παράδειγμα</p>
        <p class="mt-1 text-muted">
          Αγόρασες 10 μετοχές στα 10 € και άλλες 10 στα 20 €. Πουλάς 10 στα 25 € (250 €).
        </p>
        <ul class="mt-1 list-disc pl-4 text-muted">
          <li>
            Μέση τιμή: κόστος 10 × 15 € = 150 €, κέρδος <strong class="text-ink">100 €</strong>.
          </li>
          <li>FIFO: κόστος 10 × 10 € = 100 €, κέρδος <strong class="text-ink">150 €</strong>.</li>
        </ul>
        <p class="mt-1 text-muted">
          Όταν πουλήσεις και τις 20, το συνολικό κέρδος είναι ίδιο. Αλλάζει μόνο σε ποια χρονιά
          «πέφτει» το καθένα.
        </p>
      </div>
      <p class="mt-3 text-xs text-muted">
        Ποια μέθοδο πρέπει να δηλώσεις το αποφασίζει ο λογιστής σου. Η αναφορά γράφει πάντα ποια
        χρησιμοποιήθηκε.
      </p>
    </div>
  `,
  styles: `
    /* Under its ⓘ button, kept on screen. */
    .method-info {
      position-area: block-end span-inline-end;
      position-try-fallbacks: flip-inline, flip-block;
      margin-top: 6px;
    }
    /* Browsers without anchor positioning: the popover's default, centred on screen. */
    @supports not (position-area: block-end) {
      .method-info {
        margin: auto;
      }
    }
  `,
})
export class CostMethodPicker {
  readonly method = model.required<CostMethod>();
  protected readonly methods = METHODS;
  protected readonly infoId = `cost-method-info-${++nextId}`;
}
