import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PortfolioDto } from '@t212/shared';
import { money, timeOfDay } from '../../core/format';
import { BREAKDOWN_TEXT, signedMoney, signedPct } from './portfolio-format';

/** The two top cards: value now with the total result, and where that result came from. */
@Component({
  selector: 'app-portfolio-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (skeleton() || !data()) {
      <div class="grid gap-3 lg:grid-cols-[1fr_1.3fr]" aria-hidden="true">
        <div class="rounded-xl border border-line bg-surface p-5">
          <div class="h-3 w-40 animate-pulse rounded bg-line"></div>
          <div class="mt-3 h-8 w-48 animate-pulse rounded bg-line"></div>
          @for (i of [1, 2, 3]; track i) {
            <div class="mt-5 flex justify-between">
              <div class="h-3 w-36 animate-pulse rounded bg-line/80"></div>
              <div class="h-3 w-20 animate-pulse rounded bg-line/80"></div>
            </div>
          }
        </div>
        <div class="rounded-xl border border-line bg-surface p-5">
          <div class="h-3 w-48 animate-pulse rounded bg-line"></div>
          @for (w of [60, 95, 8, 10, 14]; track $index) {
            <div class="mt-5 flex justify-between">
              <div class="h-3 w-40 animate-pulse rounded bg-line/80"></div>
              <div class="h-3 w-16 animate-pulse rounded bg-line/80"></div>
            </div>
            <div class="mt-2 h-1.5 animate-pulse rounded-full bg-line/60" [style.width.%]="w"></div>
          }
        </div>
      </div>
    } @else {
      @let p = data()!;
      @let c = p.currency;
      <div class="grid gap-3 lg:grid-cols-[1fr_1.3fr] lg:items-start">
        <section class="rounded-xl border border-line bg-surface p-5" aria-labelledby="now-title">
          <div class="flex items-start justify-between gap-3">
            <h2 id="now-title" class="text-sm text-muted">Αξία χαρτοφυλακίου τώρα</h2>
            <button
              type="button"
              (click)="refresh.emit()"
              [disabled]="refreshing()"
              class="flex items-center gap-1.5 text-xs text-muted hover:text-ink disabled:opacity-60"
              title="Ανανέωση τιμών"
            >
              <span
                class="size-1.5 rounded-full"
                [class]="p.stale ? 'bg-amber-500' : 'bg-gain'"
              ></span>
              {{ p.stale ? 'καθυστερημένα' : 'live' }} · {{ timeOfDay(p.asOf) }}
              <span aria-hidden="true" [class.animate-spin]="refreshing()">↻</span>
            </button>
          </div>
          <p class="mt-1 text-3xl font-semibold tracking-tight">{{ money(p.totalValue, c) }}</p>
          <dl class="mt-5 space-y-2 text-sm">
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                Έβαλες συνολικά
                <span class="text-xs">(καταθέσεις με τις χρεώσεις κάρτας − αναλήψεις)</span>
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
                {{ signedMoney(p.totalResult, c) }}
                @if (p.totalResultPct !== null) {
                  <span class="ml-1 text-xs">({{ signedPct(p.totalResultPct) }}%)</span>
                }
              </dd>
            </div>
            <div class="flex justify-between gap-4 text-xs text-muted">
              <dt>Επενδυμένα · μετρητά</dt>
              <dd>{{ money(p.investedValue, c) }} · {{ money(p.cash, c) }}</dd>
            </div>
          </dl>
        </section>

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
                    >{{ signedMoney(line.amount, c) }}</span
                  >
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
    }
  `,
})
export class PortfolioSummary {
  readonly data = input<PortfolioDto | null>(null);
  /** Show placeholders even if data is present (e.g. while a sync changes it). */
  readonly skeleton = input(false);
  readonly refreshing = input(false);
  readonly refresh = output<void>();

  private readonly maxAbs = computed(() =>
    Math.max(1, ...(this.data()?.breakdown ?? []).map((l) => Math.abs(Number(l.amount)))),
  );

  protected barWidth(amount: string): number {
    return Math.max(1, (Math.abs(Number(amount)) / this.maxAbs()) * 100);
  }

  protected readonly text = BREAKDOWN_TEXT;
  protected readonly money = money;
  protected readonly signedMoney = signedMoney;
  protected readonly signedPct = signedPct;
  protected readonly timeOfDay = timeOfDay;
  protected readonly Number = Number;
  protected readonly Math = Math;
}
