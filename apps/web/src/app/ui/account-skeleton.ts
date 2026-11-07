import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder with the shape of the account page while its data is loading. */
@Component({
  selector: 'app-account-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-hidden': 'true' },
  template: `
    <div class="animate-pulse">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex gap-4">
          <div class="h-10 w-48 rounded-lg bg-line/70"></div>
          <div class="h-10 w-36 rounded-lg bg-line/70"></div>
        </div>
        <div class="flex gap-2">
          <div class="h-10 w-40 rounded-lg bg-line/70"></div>
          <div class="h-10 w-20 rounded-lg bg-line/70"></div>
        </div>
      </div>

      <div class="mt-6 grid gap-3 lg:grid-cols-[1.2fr_2fr]">
        <div class="rounded-xl border border-line bg-surface p-5">
          <div class="h-3 w-32 rounded bg-line"></div>
          <div class="mt-3 h-8 w-44 rounded bg-line"></div>
          <div class="mt-3 h-3 w-40 rounded bg-line/70"></div>
          <div class="mt-5 h-14 rounded-lg bg-line/50"></div>
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          @for (i of tiles; track i) {
            <div class="rounded-xl border border-line bg-surface p-4">
              <div class="h-3 w-16 rounded bg-line"></div>
              <div class="mt-3 h-4 w-24 rounded bg-line"></div>
            </div>
          }
        </div>
      </div>

      <div class="mt-8 flex gap-6 border-b border-line pb-2">
        @for (w of ['w-16', 'w-28', 'w-14']; track w) {
          <div class="h-4 rounded bg-line" [class]="w"></div>
        }
      </div>
      <div class="rounded-b-xl border border-t-0 border-line bg-surface">
        @for (i of rows; track i) {
          <div class="flex items-center gap-6 border-b border-line px-4 py-3 last:border-b-0">
            <div class="h-3 w-20 rounded bg-line/80"></div>
            <div class="h-3 flex-1 rounded bg-line/60"></div>
            <div class="h-3 w-16 rounded bg-line/80"></div>
            <div class="h-3 w-20 rounded bg-line/80"></div>
          </div>
        }
      </div>
    </div>
  `,
})
export class AccountSkeleton {
  protected readonly tiles = [1, 2, 3, 4, 5, 6, 7];
  protected readonly rows = [1, 2, 3, 4, 5, 6];
}
