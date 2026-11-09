import { HttpClient, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router, type CanMatchFn } from '@angular/router';
import type { UserDto } from '@t212/shared';
import { firstValueFrom, tap } from 'rxjs';

/** Who is signed in. `undefined` until the first check with the server. */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private pending: Promise<UserDto | null> | null = null;

  readonly user = signal<UserDto | null | undefined>(undefined);

  /** Asks the server once; later calls reuse the answer. */
  async check(): Promise<UserDto | null> {
    const known = this.user();
    if (known !== undefined) return known;
    this.pending ??= firstValueFrom(this.http.get<UserDto>('/api/auth/me'))
      .catch((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) return null;
        throw error;
      })
      .then((user) => {
        this.user.set(user);
        return user;
      })
      .finally(() => (this.pending = null));
    return this.pending;
  }

  /** Forget the user (signed out, or the session ended) and show the sign-in page. */
  signedOut(redirectTo?: string): void {
    this.user.set(null);
    void this.router.navigate(['/login'], {
      queryParams: redirectTo && redirectTo !== '/' ? { redirectTo } : {},
    });
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post<void>('/api/auth/logout', {}));
    this.signedOut();
  }

  async logoutEverywhere(): Promise<void> {
    await firstValueFrom(this.http.post<void>('/api/auth/logout-everywhere', {}));
    this.signedOut();
  }
}

/** Pages that need a signed-in user. */
export const signedIn: CanMatchFn = async () => {
  // inject() only before the first await.
  const auth = inject(Auth);
  const router = inject(Router);
  // The whole address being opened (this guard sits on the empty-path parent route).
  const path = router.currentNavigation()?.extractedUrl.toString() ?? '/';
  try {
    if (await auth.check()) return true;
  } catch {
    // The server did not answer (it is down, or the connection is): say so, not a blank page.
    return router.createUrlTree(['/unavailable'], { queryParams: { redirectTo: path } });
  }
  return router.createUrlTree(['/login'], {
    queryParams: path !== '/' ? { redirectTo: path } : {},
  });
};

/** The sign-in page: someone already signed in goes to their accounts. */
export const signedOut: CanMatchFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  try {
    return (await auth.check()) ? router.createUrlTree(['/']) : true;
  } catch {
    // The sign-in page explains on its own that the server does not answer.
    return true;
  }
};

/** A 401 from the API means the session ended (expired, or signed out elsewhere). */
export const sessionEndedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  return next(req).pipe(
    tap({
      error: (error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 401 &&
          req.url.startsWith('/api/') &&
          req.url !== '/api/auth/me' &&
          auth.user()
        ) {
          auth.signedOut(router.url);
        }
      },
    }),
  );
};
