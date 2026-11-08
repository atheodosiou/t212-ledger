import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { PortfolioDto } from '@t212/shared';
import { money } from '../../core/format';
import { BREAKDOWN_TEXT, signedCompact, signedMoney, signedPct } from './portfolio-format';

/** Compact version of the top cards, shown in the sticky header once they scroll away. */
@Component({
  selector: 'app-summary-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let p = data();
    @let c = p.currency;
    <button
      type="button"
      (click)="expand.emit()"
      class="mb-3 flex w-full flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-left shadow-sm transition hover:border-brand/40"
      aria-label="Εμφάνιση ολόκληρης της σύνοψης"
    >
      <span class="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm">
        <span class="font-semibold">{{ money(p.totalValue, c) }}</span>
        <span class="text-muted">Έβαλες {{ money(p.netDeposits, c) }}</span>
        <span
          class="font-semibold"
          [class.text-gain]="Number(p.totalResult) > 0"
          [class.text-loss]="Number(p.totalResult) < 0"
        >
          {{ signedMoney(p.totalResult, c) }}
          @if (p.totalResultPct !== null) {
            ({{ signedPct(p.totalResultPct) }}%)
          }
        </span>
        <span class="ml-auto text-muted" aria-hidden="true">▾</span>
      </span>
      <span class="flex flex-wrap gap-x-3 text-xs text-muted">
        @for (line of p.breakdown; track line.key) {
          <span>
            {{ text[line.key].short }}
            <span
              class="tabular-nums"
              [class.text-gain]="Number(line.amount) > 0"
              [class.text-loss]="Number(line.amount) < 0"
              >{{ signedCompact(line.amount, c) }}</span
            >
          </span>
        }
      </span>
    </button>
  `,
})
export class SummaryBar {
  readonly data = input.required<PortfolioDto>();
  readonly expand = output<void>();

  protected readonly text = BREAKDOWN_TEXT;
  protected readonly money = money;
  protected readonly signedMoney = signedMoney;
  protected readonly signedPct = signedPct;
  protected readonly signedCompact = signedCompact;
  protected readonly Number = Number;
}
