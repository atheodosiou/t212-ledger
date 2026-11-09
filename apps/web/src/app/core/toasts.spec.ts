import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { filenameFrom } from './download';
import { describeError } from './errors';
import { Toasts } from './toasts';

const http = (status: number, message?: string) =>
  new HttpErrorResponse({ status, error: message ? { message } : null });

describe('describeError', () => {
  it('offers a retry when trying again can help', () => {
    for (const status of [0, 408, 429, 500, 502, 503, 504]) {
      expect(describeError(http(status)).retryable).toBe(true);
    }
  });

  it('offers no retry for requests that will fail the same way', () => {
    for (const status of [400, 403, 404, 409, 422]) {
      expect(describeError(http(status)).retryable).toBe(false);
    }
  });

  it("uses the server's message when it is written for users", () => {
    expect(describeError(http(502, 'Το Trading 212 απέρριψε το API key.')).message).toBe(
      'Το Trading 212 απέρριψε το API key.',
    );
    // Developer-facing (English) messages are replaced by a plain one.
    expect(describeError(http(400, 'confirmEmail must be a string')).message).toBe(
      'Τα στοιχεία που στάλθηκαν δεν είναι σωστά.',
    );
    expect(describeError(http(0)).message).toContain('σύνδεση');
  });

  it('describes errors that are not HTTP responses', () => {
    expect(describeError(new Error('boom'))).toEqual({
      message: 'Κάτι πήγε στραβά στην εφαρμογή.',
      retryable: false,
      status: null,
    });
  });
});

describe('Toasts', () => {
  let toasts: Toasts;
  beforeEach(() => {
    toasts = TestBed.inject(Toasts);
  });

  it('keeps a retryable error until it is retried or closed', () => {
    toasts.error('Ο συγχρονισμός δεν ξεκίνησε', http(503), () => undefined);
    const [t] = toasts.items();
    expect(t.retry).not.toBeNull();
    expect(t.duration).toBeNull();
  });

  it('closes an error on its own when a retry cannot help, and offers none', () => {
    toasts.error('Η διαγραφή δεν έγινε', http(404), () => undefined);
    const [t] = toasts.items();
    expect(t.retry).toBeNull();
    expect(t.duration).toBeGreaterThan(0);
  });

  it('says nothing about an expired session: the app goes to sign-in', () => {
    toasts.error('Ο λογαριασμός δεν φόρτωσε', http(401), () => undefined);
    expect(toasts.items()).toEqual([]);
  });

  it('replaces the same problem instead of stacking it', () => {
    for (let i = 0; i < 3; i++)
      toasts.error('Οι λογαριασμοί δεν φόρτωσαν', http(0), () => undefined);
    expect(toasts.items()).toHaveLength(1);
  });

  it('retries, then closes the toast', async () => {
    let calls = 0;
    toasts.error('Το PDF δεν δημιουργήθηκε', http(500), () => calls++);
    await toasts.retry(toasts.items()[0].id);
    expect(calls).toBe(1);
    expect(toasts.items()).toEqual([]);
  });
});

describe('filenameFrom', () => {
  it('reads the name the server suggests', () => {
    expect(filenameFrom('attachment; filename="trading212-real-2026-average.pdf"')).toBe(
      'trading212-real-2026-average.pdf',
    );
    expect(filenameFrom(null)).toBeNull();
  });
});
