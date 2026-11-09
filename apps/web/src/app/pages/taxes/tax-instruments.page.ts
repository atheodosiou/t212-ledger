import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TaxClass, TaxInstrumentDto } from '@t212/shared';
import { Api } from '../../core/api';
import { TAX_CLASS_HINT, TAX_CLASS_LABEL, TAX_CLASSES, taxableClass } from '../../core/tax';
import { Toasts, toastOnError } from '../../core/toasts';

/**
 * Every instrument the user has traded, with the Greek tax class the estimate uses. The
 * app suggests one from Trading 212's metadata; the user confirms or changes it.
 */
@Component({
  selector: 'app-tax-instruments-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      routerLink="/taxes"
      class="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-muted hover:text-ink"
      >‹ Φόροι</a
    >
    <h1 class="text-2xl font-semibold tracking-tight">Κατηγορίες τίτλων</h1>
    <p class="mt-1 max-w-2xl text-sm text-muted">
      Ο φόρος εξαρτάται από το τι είναι κάθε τίτλος, όχι από το πού διαπραγματεύεται. Η εφαρμογή
      προτείνει μια κατηγορία από τα στοιχεία του Trading 212. Έλεγξέ την, ειδικά για ETF: το
      Trading 212 βάζει στα ETF και ETC όπως ο φυσικός χρυσός, που φορολογούνται διαφορετικά.
    </p>

    <details class="mt-4 max-w-2xl rounded-xl border border-line bg-surface p-4 text-sm">
      <summary class="cursor-pointer font-medium">Τι σημαίνει κάθε κατηγορία</summary>
      <dl class="mt-3 space-y-2">
        @for (c of classes; track c) {
          <div>
            <dt class="font-medium">{{ label[c] }}</dt>
            <dd class="text-muted">{{ hint[c] }}</dd>
          </div>
        }
      </dl>
    </details>

    @if (list.isLoading() && !list.hasValue()) {
      <div class="mt-6 space-y-2" aria-hidden="true">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="h-16 animate-pulse rounded-xl bg-line/60"></div>
        }
      </div>
    } @else if (list.hasValue()) {
      @if (list.value().length === 0) {
        <p
          class="mt-6 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted"
        >
          Δεν υπάρχουν ακόμα τίτλοι σε πραγματικό λογαριασμό.
        </p>
      } @else {
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted" aria-live="polite">
            @if (unconfirmed() > 0) {
              <strong class="text-ink">{{ unconfirmed() }}</strong> από {{ list.value().length }}
              χωρίς επιβεβαίωση.
            } @else {
              Όλοι οι τίτλοι ({{ list.value().length }}) επιβεβαιωμένοι.
            }
          </p>
          @if (unconfirmed() > 0) {
            <button
              type="button"
              (click)="confirmAll()"
              [disabled]="saving()"
              class="min-h-10 rounded-lg bg-brand px-4 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-60"
            >
              Αποδοχή όλων των προτάσεων
            </button>
          }
        </div>

        <ul class="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
          @for (i of list.value(); track i.isin) {
            <li class="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-x-2 font-medium">
                  {{ i.ticker }}
                  @if (!i.confirmed) {
                    <span
                      class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                      >πρόταση</span
                    >
                  }
                  @if (taxable(i.taxClass)) {
                    <span class="rounded-full bg-loss/10 px-2 py-0.5 text-xs font-medium text-loss"
                      >κέρδη 15%</span
                    >
                  }
                </p>
                <p class="truncate text-sm text-muted">{{ i.name }}</p>
                <p class="text-xs text-muted">
                  {{ i.isin }}{{ i.type ? ' · Trading 212: ' + i.type : '' }}
                </p>
              </div>
              <label class="block shrink-0 text-sm">
                <span class="sr-only">Κατηγορία για {{ i.ticker }}</span>
                <select
                  (change)="set(i, $any($event.target).value)"
                  [disabled]="saving()"
                  class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm sm:w-56"
                >
                  @for (c of classes; track c) {
                    <option [value]="c" [selected]="c === i.taxClass">
                      {{ label[c] }}{{ c === i.suggested && i.confirmed ? ' (πρόταση)' : '' }}
                    </option>
                  }
                </select>
              </label>
            </li>
          }
        </ul>
      }
    }
  `,
})
export class TaxInstrumentsPage {
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);

  protected readonly list = httpResource<TaxInstrumentDto[]>(() => '/api/tax/instruments');
  protected readonly saving = signal(false);
  protected readonly unconfirmed = computed(() =>
    this.list.hasValue() ? this.list.value().filter((i) => !i.confirmed).length : 0,
  );

  protected readonly classes = TAX_CLASSES;
  protected readonly label = TAX_CLASS_LABEL;
  protected readonly hint = TAX_CLASS_HINT;
  protected readonly taxable = taxableClass;

  constructor() {
    toastOnError(this.list, 'Οι τίτλοι δεν φόρτωσαν');
  }

  protected set(i: TaxInstrumentDto, taxClass: TaxClass): Promise<void> {
    return this.save({ [i.isin]: taxClass }, `${i.ticker}: ${TAX_CLASS_LABEL[taxClass]}`);
  }

  protected confirmAll(): Promise<void> {
    const classes = Object.fromEntries(
      this.list
        .value()!
        .filter((i) => !i.confirmed)
        .map((i) => [i.isin, i.suggested]),
    );
    return this.save(classes, 'Οι προτάσεις επιβεβαιώθηκαν');
  }

  private async save(classes: Record<string, TaxClass>, done: string): Promise<void> {
    this.saving.set(true);
    try {
      this.list.set(await this.api.setTaxClasses(classes));
      this.toasts.success(done);
    } catch (error) {
      this.toasts.error('Η αλλαγή δεν αποθηκεύτηκε', error, () => this.save(classes, done));
      this.list.reload();
    } finally {
      this.saving.set(false);
    }
  }
}
