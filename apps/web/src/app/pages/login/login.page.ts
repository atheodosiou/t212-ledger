import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AuthConfigDto } from '@t212/shared';

const ERRORS: Record<string, string> = {
  'unverified-email': 'Η Google δεν επιβεβαίωσε τη διεύθυνση email αυτού του λογαριασμού.',
  cancelled: 'Η σύνδεση ακυρώθηκε.',
  failed: 'Η σύνδεση δεν ολοκληρώθηκε. Δοκίμασε ξανά.',
};

@Component({
  selector: 'app-login-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm">
      <h1 class="text-2xl font-semibold tracking-tight">Σύνδεση</h1>
      <p class="mt-2 text-sm text-muted">
        Όλο το ιστορικό σου στο Trading 212, με αναφορές έτοιμες για τον λογιστή.
      </p>

      @if (message(); as text) {
        <p role="alert" class="mt-5 rounded-lg bg-loss/5 p-3 text-sm text-loss">{{ text }}</p>
      }

      <div class="mt-6 grid gap-3">
        @if (config.isLoading()) {
          <div class="h-11 animate-pulse rounded-lg bg-line/60"></div>
        } @else if (config.error()) {
          <p class="text-sm text-loss">Ο server δεν απαντά. Δοκίμασε ξανά σε λίγο.</p>
        } @else {
          @if (config.value()?.google) {
            <a
              [href]="googleUrl()"
              class="flex h-11 items-center justify-center gap-3 rounded-lg border border-line bg-surface font-medium transition hover:border-brand/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-brand"
            >
              <svg viewBox="0 0 48 48" class="size-5" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              Σύνδεση με Google
            </a>
          } @else {
            <p class="text-sm text-loss">
              Η σύνδεση δεν είναι διαθέσιμη: ο server δεν έχει ρυθμιστεί για σύνδεση με Google.
            </p>
          }
        }
      </div>

      <p class="mt-6 text-xs text-muted">
        <a routerLink="/privacy" class="underline hover:text-ink">Απόρρητο</a>
      </p>
    </div>
  `,
})
export class LoginPage {
  /** Query parameters. */
  readonly error = input<string>();
  readonly redirectTo = input<string>();

  protected readonly config = httpResource<AuthConfigDto>(() => '/api/auth/config');

  protected readonly message = computed(() => {
    const code = this.error();
    return code ? (ERRORS[code] ?? ERRORS['failed']) : null;
  });

  /** Only a path inside the app, never another site. */
  private readonly target = computed(() => {
    const to = this.redirectTo();
    return to?.startsWith('/') && !to.startsWith('//') ? to : '/';
  });

  protected readonly googleUrl = computed(
    () => `/api/auth/oidc/google/login?redirectTo=${encodeURIComponent(this.target())}`,
  );
}
