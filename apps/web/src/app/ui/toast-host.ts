import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Toasts } from '../core/toasts';

const TICK_MS = 250;

/**
 * Where toasts appear: bottom right (bottom, full width on phones). Toasts that close on
 * their own count down only while the pointer and keyboard focus are elsewhere, so
 * there is always time to read them (WCAG 2.2.1).
 */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-96',
    '(mouseenter)': 'paused.set(true)',
    '(mouseleave)': 'paused.set(false)',
    '(focusin)': 'paused.set(true)',
    '(focusout)': 'paused.set(false)',
  },
  template: `
    <div class="sr-only" aria-live="polite">
      @for (t of toasts.items(); track t.id) {
        @if (t.kind === 'success') {
          <p>{{ t.title }}. {{ t.message }}</p>
        }
      }
    </div>
    @for (t of toasts.items(); track t.id) {
      <div
        class="toast pointer-events-auto flex gap-3 rounded-xl border bg-surface p-3 text-sm shadow-lg"
        [class]="t.kind === 'error' ? 'border-loss/30' : 'border-gain/30'"
        [attr.role]="t.kind === 'error' ? 'alert' : null"
      >
        <span
          aria-hidden="true"
          class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
          [class]="t.kind === 'error' ? 'bg-loss' : 'bg-gain'"
          >{{ t.kind === 'error' ? '!' : '✓' }}</span
        >
        <div class="min-w-0 flex-1">
          <p class="font-medium">{{ t.title }}</p>
          @if (t.message) {
            <p class="mt-0.5 text-muted">{{ t.message }}</p>
          }
          @if (t.retry) {
            <button
              type="button"
              (click)="toasts.retry(t.id)"
              [disabled]="t.retrying"
              class="mt-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-strong disabled:opacity-60"
            >
              {{ t.retrying ? 'Δοκιμάζει ξανά…' : 'Δοκίμασε ξανά' }}
            </button>
          }
        </div>
        <button
          type="button"
          (click)="toasts.dismiss(t.id)"
          class="-m-1 grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink"
          aria-label="Κλείσιμο"
        >
          ✕
        </button>
      </div>
    }
  `,
  styles: `
    .toast {
      transition:
        opacity 0.2s ease,
        translate 0.2s ease;
      @starting-style {
        opacity: 0;
        translate: 0 0.5rem;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .toast {
        transition: none;
      }
    }
  `,
})
export class ToastHost {
  protected readonly toasts = inject(Toasts);
  protected readonly paused = signal(false);
  /** Time each self-closing toast has been on screen while not paused. */
  private readonly shown = new Map<number, number>();

  constructor() {
    const timer = setInterval(() => this.tick(), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private tick(): void {
    if (this.paused()) return;
    const live = new Set<number>();
    for (const t of this.toasts.items()) {
      live.add(t.id);
      if (t.duration === null) continue;
      const elapsed = (this.shown.get(t.id) ?? 0) + TICK_MS;
      if (elapsed >= t.duration) {
        this.toasts.dismiss(t.id);
        this.shown.delete(t.id);
      } else this.shown.set(t.id, elapsed);
    }
    for (const id of this.shown.keys()) if (!live.has(id)) this.shown.delete(id);
  }
}
