import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

/** Shown when the server does not answer at all, instead of a blank page. */
@Component({
  selector: 'app-unavailable-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm"
    >
      <h1 class="text-xl font-semibold tracking-tight">Ο server δεν απαντά</h1>
      <p class="mt-2 text-sm text-muted">
        Ίσως χάθηκε η σύνδεσή σου στο internet, ή ο server ενημερώνεται. Τα δεδομένα σου είναι
        ασφαλή.
      </p>
      <button
        type="button"
        (click)="retry()"
        [disabled]="retrying()"
        class="mt-6 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-60"
      >
        {{ retrying() ? 'Δοκιμάζει ξανά…' : 'Δοκίμασε ξανά' }}
      </button>
    </div>
  `,
})
export class UnavailablePage {
  private readonly router = inject(Router);
  /** Query parameter: where to go once the server answers. */
  readonly redirectTo = input<string>();
  protected readonly retrying = signal(false);

  /** Only a path inside the app. */
  private readonly target = computed(() => {
    const to = this.redirectTo();
    return to?.startsWith('/') && !to.startsWith('//') && !to.startsWith('/unavailable') ? to : '/';
  });

  protected async retry(): Promise<void> {
    this.retrying.set(true);
    try {
      await this.router.navigateByUrl(this.target());
    } finally {
      this.retrying.set(false);
    }
  }
}
