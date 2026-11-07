import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BreakdownKey, PortfolioDto } from '@t212/shared';
import { apiErrorMessage, money, qty, sumMoney, ticker, timeOfDay } from '../../core/format';
import { whileActive } from '../../core/poll';

const BREAKDOWN_TEXT: Record<BreakdownKey, { label: string; hint: string }> = {
  realised: {
    label: 'Μετοχές που πούλησες',
    hint: 'Κέρδος ή ζημιά από όσα έχεις ήδη πουλήσει, μετά τις χρεώσεις.',
  },
  unrealised: {
    label: 'Μετοχές που κρατάς',
    hint: 'Τρέχουσα αξία μείον κόστος αγοράς. Γίνεται οριστικό μόνο αν πουλήσεις.',
  },
  dividends: { label: 'Μερίσματα', hint: 'Καθαρά, μετά τον φόρο που παρακρατήθηκε.' },
  interest: { label: 'Τόκοι', hint: 'Τόκοι στα αδιάθετα μετρητά.' },
  fees: {
    label: 'Χρεώσεις καταθέσεων',
    hint: 'Χρεώσεις που δεν αφορούν συναλλαγή. Οι χρεώσεις αγορών και πωλήσεων είναι ήδη μέσα στις γραμμές πάνω.',
  },
  other: { label: 'Άλλες κινήσεις', hint: 'Κινήσεις μετρητών που δεν ανήκουν σε άλλη κατηγορία.' },
};

const REFRESH_MS = 60_000;

/** Live account value, the total result since the first deposit, its breakdown, and open positions. */
@Component({
  selector: 'app-portfolio-now',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (portfolio.error() && !portfolio.hasValue()) {
      <div class="rounded-xl border border-loss/30 bg-loss/5 p-4 text-sm text-loss">
        {{ errorMessage() }}
        <button type="button" (click)="portfolio.reload()" class="ml-2 font-medium underline">
          Δοκίμασε ξανά
        </button>
      </div>
    } @else if (!portfolio.hasValue()) {
      <div class="grid animate-pulse gap-3 lg:grid-cols-[1fr_1.3fr]" aria-hidden="true">
        <div class="h-56 rounded-xl bg-line/60"></div>
        <div class="h-56 rounded-xl bg-line/60"></div>
      </div>
      <div class="mt-3 h-48 animate-pulse rounded-xl bg-line/50" aria-hidden="true"></div>
    } @else {
      @let p = portfolio.value();
      @let c = p.currency;
      <div class="grid gap-3 lg:grid-cols-[1fr_1.3fr]">
        <!-- Now -->
        <section class="rounded-xl border border-line bg-surface p-5" aria-labelledby="now-title">
          <div class="flex items-start justify-between gap-3">
            <h2 id="now-title" class="text-sm text-muted">Αξία χαρτοφυλακίου τώρα</h2>
            <button
              type="button"
              (click)="portfolio.reload()"
              [disabled]="portfolio.isLoading()"
              class="flex items-center gap-1.5 text-xs text-muted hover:text-ink disabled:opacity-60"
              title="Ανανέωση τιμών"
            >
              <span
                class="size-1.5 rounded-full"
                [class]="p.stale ? 'bg-amber-500' : 'bg-gain'"
              ></span>
              {{ p.stale ? 'καθυστερημένα' : 'live' }} · {{ timeOfDay(p.asOf) }}
              <span aria-hidden="true">↻</span>
            </button>
          </div>
          <p class="mt-1 text-3xl font-semibold tracking-tight">{{ money(p.totalValue, c) }}</p>

          <dl class="mt-5 space-y-2 text-sm">
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                Έβαλες συνολικά <span class="text-xs">(καταθέσεις − αναλήψεις)</span>
              </dt>
              <dd class="font-medium">{{ money(p.netDeposits, c) }}</dd>
            </div>
            <div class="flex justify-between gap-4 border-t border-line pt-2">
              <dt class="font-medium">Συνολικό αποτέλεσμα</dt>
              <dd
                class="text-right font-semibold"
                [class.text-gain]="Number(p.totalResult) > 0"
                [class.text-loss]="Number(p.totalResult) < 0"
              >
                {{ money(p.totalResult, c) }}
                @if (p.totalResultPct !== null) {
                  <span class="ml-1 text-xs">({{ signed(p.totalResultPct) }}%)</span>
                }
              </dd>
            </div>
            <div class="flex justify-between gap-4 text-xs text-muted">
              <dt>Επενδυμένα · μετρητά</dt>
              <dd>{{ money(p.investedValue, c) }} · {{ money(p.cash, c) }}</dd>
            </div>
          </dl>
        </section>

        <!-- Breakdown -->
        <section
          class="rounded-xl border border-line bg-surface p-5"
          aria-labelledby="breakdown-title"
        >
          <h2 id="breakdown-title" class="text-sm font-semibold">Από πού προήλθε το αποτέλεσμα</h2>
          <p class="text-xs text-muted">Από την πρώτη σου κατάθεση μέχρι σήμερα.</p>
          <ul class="mt-4 space-y-3">
            @for (line of p.breakdown; track line.key) {
              <li>
                <div class="flex items-baseline justify-between gap-4 text-sm">
                  <span>{{ text[line.key].label }}</span>
                  <span
                    class="whitespace-nowrap font-medium tabular-nums"
                    [class.text-gain]="Number(line.amount) > 0"
                    [class.text-loss]="Number(line.amount) < 0"
                  >
                    {{ signedMoney(line.amount, c) }}
                  </span>
                </div>
                <div class="mt-1 h-1.5 rounded-full bg-canvas" aria-hidden="true">
                  <div
                    class="h-1.5 rounded-full"
                    [class]="Number(line.amount) >= 0 ? 'bg-gain/70' : 'bg-loss/70'"
                    [style.width.%]="barWidth(line.amount)"
                  ></div>
                </div>
                <p class="mt-1 text-[11px] leading-snug text-muted">{{ text[line.key].hint }}</p>
              </li>
            }
          </ul>
          <div class="mt-4 flex justify-between border-t border-line pt-3 text-sm font-semibold">
            <span>Σύνολο</span>
            <span
              [class.text-gain]="Number(p.breakdownTotal) > 0"
              [class.text-loss]="Number(p.breakdownTotal) < 0"
              >{{ signedMoney(p.breakdownTotal, c) }}</span
            >
          </div>
          @if (Math.abs(Number(p.unexplained)) >= 1) {
            <p class="mt-2 text-xs text-amber-800">
              {{ money(p.unexplained, c) }} δεν εξηγούνται από το ιστορικό. Ίσως λείπει κάποια
              κίνηση· κάνε συγχρονισμό.
            </p>
          }
        </section>
      </div>

      <!-- Positions -->
      <section
        class="mt-3 overflow-x-auto rounded-xl border border-line bg-surface"
        aria-labelledby="positions-title"
      >
        <h2 id="positions-title" class="px-5 pb-2 pt-4 text-sm font-semibold">
          Θέσεις τώρα <span class="font-normal text-muted">· {{ p.positions.length }}</span>
        </h2>
        <table class="w-full min-w-[760px] text-sm">
          <thead class="bg-canvas text-left text-xs text-muted">
            <tr>
              <th class="px-5 py-2 font-medium">Τίτλος</th>
              <th class="px-4 py-2 text-right font-medium">Μετοχές</th>
              <th class="px-4 py-2 text-right font-medium">Τιμή</th>
              <th class="px-4 py-2 text-right font-medium">Αξία</th>
              <th class="px-4 py-2 text-right font-medium">Κόστος</th>
              <th class="px-4 py-2 text-right font-medium">Αποτέλεσμα</th>
              <th class="px-5 py-2 text-right font-medium">Βάρος</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            @for (pos of p.positions; track pos.isin ?? pos.ticker) {
              <tr class="hover:bg-canvas/60">
                <td class="px-5 py-2.5">
                  <span class="font-medium">{{ ticker(pos.ticker) }}</span>
                  <span class="ml-1 text-muted">{{ pos.instrumentName }}</span>
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right">{{ qty(pos.quantity) }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right text-muted">
                  {{ qty(pos.currentPrice) }} {{ pos.instrumentCurrency }}
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                  {{ money(pos.value, c) }}
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right text-muted">
                  {{ money(pos.cost, c) }}
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right">
                  <span
                    class="font-medium"
                    [class.text-gain]="Number(pos.result) > 0"
                    [class.text-loss]="Number(pos.result) < 0"
                  >
                    {{ signedMoney(pos.result, c) }}
                    @if (pos.resultPct !== null) {
                      <span class="text-xs">({{ signed(pos.resultPct) }}%)</span>
                    }
                  </span>
                  @if (pos.fxImpact !== null && Number(pos.fxImpact) !== 0) {
                    <span class="block text-[11px] text-muted">
                      εκ των οποίων συνάλλαγμα {{ signedMoney(pos.fxImpact, c) }}
                    </span>
                  }
                </td>
                <td class="whitespace-nowrap px-5 py-2.5 text-right">
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
          @if (p.positions.length) {
            <tfoot class="border-t border-line bg-canvas/60 text-sm font-medium">
              <tr>
                <td class="px-5 py-2.5" colspan="3">Σύνολο</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right">
                  {{ money(p.investedValue, c) }}
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right text-muted">
                  {{ money(totalCost(), c) }}
                </td>
                <td
                  class="whitespace-nowrap px-4 py-2.5 text-right"
                  [class.text-gain]="Number(totalOpenResult()) > 0"
                  [class.text-loss]="Number(totalOpenResult()) < 0"
                >
                  {{ signedMoney(totalOpenResult(), c) }}
                </td>
                <td class="px-5 py-2.5"></td>
              </tr>
            </tfoot>
          }
        </table>
        <p class="px-5 py-3 text-[11px] text-muted">
          Κόστος με τις χρεώσεις αγοράς. Τιμές από το Trading 212, ανανεώνονται κάθε λεπτό.
        </p>
      </section>
    }
  `,
})
export class PortfolioNow {
  readonly accountId = input.required<string>();
  /** Changes when a sync finishes, which refetches the view. */
  readonly refreshKey = input<string | null>(null);

  protected readonly portfolio = httpResource<PortfolioDto>(() => {
    this.refreshKey();
    return `/api/accounts/${this.accountId()}/portfolio`;
  });

  constructor() {
    whileActive(
      () => true,
      REFRESH_MS,
      () => {
        if (document.visibilityState === 'visible') this.portfolio.reload();
      },
    );
  }

  protected readonly errorMessage = computed(() =>
    apiErrorMessage(
      this.portfolio.error(),
      'Δεν ήταν δυνατή η λήψη live δεδομένων από το Trading 212.',
    ),
  );

  private readonly maxAbs = computed(() =>
    this.portfolio.hasValue()
      ? Math.max(1, ...this.portfolio.value().breakdown.map((l) => Math.abs(Number(l.amount))))
      : 1,
  );

  protected readonly totalCost = computed(() =>
    this.portfolio.hasValue() ? sumMoney(this.portfolio.value().positions.map((p) => p.cost)) : '0',
  );
  protected readonly totalOpenResult = computed(() =>
    this.portfolio.hasValue()
      ? sumMoney(this.portfolio.value().positions.map((p) => p.result))
      : '0',
  );

  protected barWidth(amount: string): number {
    return Math.max(1, (Math.abs(Number(amount)) / this.maxAbs()) * 100);
  }

  protected signed(pct: string): string {
    const n = Number(pct);
    return `${n > 0 ? '+' : ''}${pct.replace('.', ',')}`;
  }

  protected signedMoney(value: string, currency: string): string {
    return `${Number(value) > 0 ? '+' : ''}${money(value, currency)}`;
  }

  protected readonly text = BREAKDOWN_TEXT;
  protected readonly money = money;
  protected readonly qty = qty;
  protected readonly ticker = ticker;
  protected readonly timeOfDay = timeOfDay;
  protected readonly Number = Number;
  protected readonly Math = Math;
}
