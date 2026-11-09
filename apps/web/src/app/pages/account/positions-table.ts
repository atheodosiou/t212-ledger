import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { LivePositionDto, SortDir } from '@t212/shared';
import { money, price, qty, sumMoney, ticker } from '../../core/format';
import { SkeletonRows, SortHeader } from '../../ui/table';
import { signedMoney, signedPct } from './portfolio-format';

type PositionSort = 'ticker' | 'quantity' | 'value' | 'cost' | 'result' | 'resultPct' | 'weightPct';

/** Open positions with live values. Few rows, so sorting happens in the browser. */
@Component({
  selector: 'app-positions-table',
  imports: [SortHeader, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-xl border border-line bg-surface" aria-labelledby="positions-title">
      <h2 id="positions-title" class="px-5 pb-2 pt-4 text-sm font-semibold">
        Θέσεις τώρα
        @if (!skeleton()) {
          <span class="font-normal text-muted">· {{ positions().length }}</span>
        }
      </h2>
      <div class="sm:overflow-x-auto lg:overflow-visible">
        <table class="stack-table w-full min-w-[760px] text-sm">
          <thead
            class="sticky-head bg-canvas text-left text-xs text-muted shadow-[0_1px_0_var(--color-line)]"
          >
            <tr>
              <th
                class="px-5 py-2"
                sortKey="ticker"
                firstDir="asc"
                [sort]="sort()"
                [dir]="dir()"
                (sorted)="setSort($event)"
              >
                Τίτλος
              </th>
              <th
                class="px-4 py-2"
                sortKey="quantity"
                align="right"
                [sort]="sort()"
                [dir]="dir()"
                (sorted)="setSort($event)"
              >
                Μετοχές
              </th>
              <th class="px-4 py-2 text-right font-medium">Τιμή</th>
              <th
                class="px-4 py-2"
                sortKey="value"
                align="right"
                [sort]="sort()"
                [dir]="dir()"
                (sorted)="setSort($event)"
              >
                Αξία
              </th>
              <th
                class="px-4 py-2"
                sortKey="cost"
                align="right"
                [sort]="sort()"
                [dir]="dir()"
                (sorted)="setSort($event)"
              >
                Κόστος
              </th>
              <th
                class="px-4 py-2"
                sortKey="result"
                align="right"
                [sort]="sort()"
                [dir]="dir()"
                (sorted)="setSort($event)"
              >
                Αποτέλεσμα
              </th>
              <th
                class="px-5 py-2"
                sortKey="weightPct"
                align="right"
                [sort]="sort()"
                [dir]="dir()"
                (sorted)="setSort($event)"
              >
                Βάρος
              </th>
            </tr>
          </thead>
          @if (skeleton()) {
            <tbody skeletonRows [rows]="5" [cols]="7"></tbody>
          } @else {
            <tbody class="divide-y divide-line">
              @for (pos of sorted(); track pos.isin ?? pos.ticker) {
                <tr class="hover:bg-canvas/60">
                  <td class="stack-title px-5 py-2.5">
                    <span class="font-medium">{{ ticker(pos.ticker) }}</span>
                    <span class="ml-1 text-muted">{{ pos.instrumentName }}</span>
                  </td>
                  <td data-label="Μετοχές" class="whitespace-nowrap px-4 py-2.5 text-right">
                    {{ qty(pos.quantity) }}
                  </td>
                  <td data-label="Τιμή" class="whitespace-nowrap px-4 py-2.5 text-right text-muted">
                    {{ price(pos.currentPrice) }} {{ pos.instrumentCurrency }}
                  </td>
                  <td
                    data-label="Αξία"
                    class="whitespace-nowrap px-4 py-2.5 text-right font-medium"
                  >
                    {{ money(pos.value, currency()) }}
                  </td>
                  <td
                    data-label="Κόστος"
                    class="whitespace-nowrap px-4 py-2.5 text-right text-muted"
                  >
                    {{ money(pos.cost, currency()) }}
                  </td>
                  <td data-label="Αποτέλεσμα" class="whitespace-nowrap px-4 py-2.5 text-right">
                    <span>
                      <span
                        class="font-medium"
                        [class.text-gain]="Number(pos.result) > 0"
                        [class.text-loss]="Number(pos.result) < 0"
                      >
                        {{ signedMoney(pos.result, currency()) }}
                        @if (pos.resultPct !== null) {
                          <span class="text-xs">({{ signedPct(pos.resultPct) }}%)</span>
                        }
                      </span>
                      @if (pos.fxImpact !== null && Number(pos.fxImpact) !== 0) {
                        <span class="block text-xs text-muted">
                          εκ των οποίων από την ισοτιμία {{ signedMoney(pos.fxImpact, currency()) }}
                        </span>
                      }
                    </span>
                  </td>
                  <td data-label="Βάρος" class="whitespace-nowrap px-5 py-2.5 text-right">
                    <span class="inline-flex items-center gap-2">
                      <span
                        class="hidden h-1.5 w-12 rounded-full bg-canvas sm:inline-block"
                        aria-hidden="true"
                      >
                        <span
                          class="block h-1.5 rounded-full bg-brand/70"
                          [style.width.%]="pos.weightPct"
                        ></span>
                      </span>
                      {{ pos.weightPct.replace('.', ',') }}%
                    </span>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" class="px-5 py-8 text-center text-muted">Καμία ανοιχτή θέση.</td>
                </tr>
              }
            </tbody>
            @if (positions().length) {
              <tfoot class="border-t border-line bg-canvas/60 text-sm font-medium">
                <tr>
                  <td class="stack-title px-5 py-2.5" colspan="3">Σύνολο</td>
                  <td data-label="Αξία" class="whitespace-nowrap px-4 py-2.5 text-right">
                    {{ money(totals().value, currency()) }}
                  </td>
                  <td
                    data-label="Κόστος"
                    class="whitespace-nowrap px-4 py-2.5 text-right text-muted"
                  >
                    {{ money(totals().cost, currency()) }}
                  </td>
                  <td
                    data-label="Αποτέλεσμα"
                    class="whitespace-nowrap px-4 py-2.5 text-right"
                    [class.text-gain]="Number(totals().result) > 0"
                    [class.text-loss]="Number(totals().result) < 0"
                  >
                    {{ signedMoney(totals().result, currency()) }}
                  </td>
                  <td class="hidden px-5 py-2.5 sm:table-cell"></td>
                </tr>
              </tfoot>
            }
          }
        </table>
      </div>
      <p class="px-5 py-3 text-xs text-muted">
        Κόστος με τις χρεώσεις αγοράς. Τιμές από το Trading 212, ανανεώνονται κάθε λεπτό.
      </p>
    </section>
  `,
})
export class PositionsTable {
  readonly positions = input<LivePositionDto[]>([]);
  readonly currency = input('EUR');
  readonly skeleton = input(false);

  protected readonly sort = signal<PositionSort>('value');
  protected readonly dir = signal<SortDir>('desc');

  protected readonly sorted = computed(() => {
    const key = this.sort();
    const factor = this.dir() === 'asc' ? 1 : -1;
    return [...this.positions()].sort((a, b) => {
      if (key === 'ticker') return a.ticker.localeCompare(b.ticker) * factor;
      return (Number(a[key] ?? 0) - Number(b[key] ?? 0)) * factor;
    });
  });

  protected readonly totals = computed(() => ({
    value: sumMoney(this.positions().map((p) => p.value)),
    cost: sumMoney(this.positions().map((p) => p.cost)),
    result: sumMoney(this.positions().map((p) => p.result)),
  }));

  protected setSort(event: { sort: string; dir: SortDir }): void {
    this.sort.set(event.sort as PositionSort);
    this.dir.set(event.dir);
  }

  protected readonly money = money;
  protected readonly qty = qty;
  protected readonly price = price;
  protected readonly ticker = ticker;
  protected readonly signedMoney = signedMoney;
  protected readonly signedPct = signedPct;
  protected readonly Number = Number;
}
