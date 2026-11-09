import { HttpErrorResponse } from '@angular/common/http';

export interface DescribedError {
  /** What went wrong, in words a user understands. */
  message: string;
  /** Trying again may well work (no connection, a timeout, a busy or failing server). */
  retryable: boolean;
  /** HTTP status, or null for errors that are not HTTP responses. */
  status: number | null;
}

const GREEK = /[Ͱ-Ͽἀ-῿]/;

/** The server's own message, when it wrote one for users (in Greek). */
function serverMessage(error: HttpErrorResponse): string | null {
  const body = error.error as { message?: string | string[] } | null;
  const message = Array.isArray(body?.message) ? body.message.join(' · ') : body?.message;
  return message && GREEK.test(message) ? message : null;
}

/**
 * Turns any error into a message and whether a retry makes sense. Mistakes in what was
 * asked (400, 403, 404, 409, 422) will fail the same way again, so they get no retry;
 * a lost connection, a timeout, rate limits and server failures usually pass.
 */
export function describeError(error: unknown): DescribedError {
  if (!(error instanceof HttpErrorResponse)) {
    return { message: 'Κάτι πήγε στραβά στην εφαρμογή.', retryable: false, status: null };
  }
  const own = serverMessage(error);
  const status = error.status;
  const result = (message: string, retryable: boolean) => ({
    message: own ?? message,
    retryable,
    status,
  });
  if (status === 0)
    return {
      message: 'Δεν υπάρχει σύνδεση με τον server. Έλεγξε τη σύνδεσή σου στο internet.',
      retryable: true,
      status,
    };
  if (status === 401) return result('Η σύνδεσή σου έληξε. Συνδέσου ξανά.', false);
  if (status === 403) return result('Δεν επιτρέπεται αυτή η ενέργεια.', false);
  if (status === 404) return result('Δεν βρέθηκε. Ίσως έχει διαγραφεί.', false);
  if (status === 408) return result('Ο server άργησε να απαντήσει.', true);
  if (status === 409) return result('Η ενέργεια συγκρούεται με κάτι που ήδη γίνεται.', false);
  if (status === 429) return result('Πολλά αιτήματα σε λίγο χρόνο. Περίμενε λίγο.', true);
  // Our API explains Trading 212 failures in its own (Greek) message; a bare 502 comes
  // from the proxy in front of it, i.e. the API itself is not answering.
  if (status === 502 || status === 503 || status === 504)
    return result('Ο server δεν είναι διαθέσιμος αυτή τη στιγμή.', true);
  if (status >= 500) return result('Σφάλμα στον server.', true);
  return result('Τα στοιχεία που στάλθηκαν δεν είναι σωστά.', false);
}
