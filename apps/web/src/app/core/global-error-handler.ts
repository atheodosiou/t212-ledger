import { ErrorHandler, inject, Injectable, NgZone } from '@angular/core';
import { Toasts } from './toasts';

/**
 * Errors nothing else handled (a bug, a failed lazy-loaded page): logged for developers,
 * and the user is told something went wrong instead of the page silently doing nothing.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toasts = inject(Toasts);
  private readonly zone = inject(NgZone, { optional: true });

  handleError(error: unknown): void {
    console.error(error);
    const report = () =>
      isChunkLoadError(error)
        ? this.toasts.failure(
            'Η σελίδα δεν φόρτωσε',
            'Ίσως κυκλοφόρησε νέα έκδοση της εφαρμογής ή χάθηκε η σύνδεση.',
            () => location.reload(),
          )
        : this.toasts.error('Κάτι πήγε στραβά', error);
    if (this.zone) this.zone.run(report);
    else report();
  }
}

/** A lazy-loaded page that failed to download, usually after a new release. */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(
    message,
  );
}
