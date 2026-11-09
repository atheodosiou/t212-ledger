import { HttpErrorResponse } from '@angular/common/http';
import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { describeError } from './errors';

export type ToastKind = 'error' | 'success';

export interface Toast {
  id: number;
  kind: ToastKind;
  /** What the user was doing, e.g. "Ο συγχρονισμός δεν ξεκίνησε". */
  title: string;
  /** Why, when known. */
  message: string | null;
  /** Shown as a button only when trying again can help. */
  retry: (() => unknown) | null;
  /** Milliseconds before it closes on its own; null: stays until closed or retried. */
  duration: number | null;
  retrying: boolean;
}

/** Long enough to read two lines; paused while the pointer or focus is on the toast. */
const ERROR_MS = 8_000;
const SUCCESS_MS = 4_000;
const MAX_TOASTS = 4;

let nextId = 0;

/**
 * Messages about what just happened. Errors that a retry may fix stay with a "Δοκίμασε
 * ξανά" button; others, and confirmations, close on their own.
 */
@Injectable({ providedIn: 'root' })
export class Toasts {
  readonly items = signal<Toast[]>([]);

  /**
   * Reports a failure. `retry` repeats what failed; it is offered only when the error
   * is one a retry can fix (no connection, a timeout, a server or Trading 212 failure).
   * An expired session (401) is not reported: the app goes to the sign-in page.
   */
  error(title: string, error: unknown, retry?: () => unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 401) return;
    const described = describeError(error);
    const canRetry = !!retry && described.retryable;
    this.push({
      kind: 'error',
      title,
      message: described.message,
      retry: canRetry ? retry : null,
      duration: canRetry ? null : ERROR_MS,
    });
  }

  /** A failure described by the caller; `retry` is always offered when given. */
  failure(title: string, message: string, retry?: () => unknown): void {
    this.push({
      kind: 'error',
      title,
      message,
      retry: retry ?? null,
      duration: retry ? null : ERROR_MS,
    });
  }

  success(title: string, message: string | null = null): void {
    this.push({ kind: 'success', title, message, retry: null, duration: SUCCESS_MS });
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }

  /** Runs the toast's retry; the toast closes, and a new one appears if it fails again. */
  async retry(id: number): Promise<void> {
    const toast = this.items().find((t) => t.id === id);
    if (!toast?.retry || toast.retrying) return;
    this.items.update((list) => list.map((t) => (t.id === id ? { ...t, retrying: true } : t)));
    try {
      await toast.retry();
    } finally {
      this.dismiss(id);
    }
  }

  private push(toast: Omit<Toast, 'id' | 'retrying'>): void {
    this.items.update((list) => {
      // The same problem again (e.g. while polling) replaces the old toast, not stacks.
      const rest = list.filter((t) => !(t.title === toast.title && t.message === toast.message));
      return [...rest, { ...toast, id: ++nextId, retrying: false }].slice(-MAX_TOASTS);
    });
  }
}

/**
 * Toasts a resource's load failures, with a retry that reloads it. Must be called in an
 * injection context. Each failure is reported once, not on every re-render.
 */
export function toastOnError(
  resource: { error: () => unknown; reload: () => unknown },
  title: string | (() => string),
): void {
  const toasts = inject(Toasts);
  let reported: unknown = null;
  effect(() => {
    const error = resource.error();
    if (!error || error === reported) return;
    reported = error;
    untracked(() =>
      toasts.error(typeof title === 'function' ? title() : title, error, () => resource.reload()),
    );
  });
}
