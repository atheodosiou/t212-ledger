import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { Toasts } from '../core/toasts';

/** The signed-in user's address, with their account page and sign-out. */
@Component({
  selector: 'app-user-menu',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.user(); as user) {
      <button
        type="button"
        popovertarget="user-menu"
        class="flex max-w-72 items-center gap-2 rounded-lg px-2 py-1 text-sm transition hover:bg-canvas"
        [attr.aria-label]="'Μενού χρήστη ' + user.email"
      >
        <span
          class="grid size-7 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand"
          aria-hidden="true"
          >{{ (user.name || user.email).charAt(0).toUpperCase() }}</span
        >
        <span class="hidden truncate sm:inline">{{ user.email }}</span>
      </button>
      <div
        id="user-menu"
        popover
        class="user-menu m-0 w-56 rounded-xl border border-line bg-surface p-1 text-sm shadow-lg"
      >
        <p class="truncate px-3 py-2 text-xs text-muted">{{ user.email }}</p>
        <a
          routerLink="/settings"
          (click)="close()"
          class="block rounded-lg px-3 py-2 hover:bg-canvas"
          >Ο λογαριασμός μου</a
        >
        <a
          routerLink="/privacy"
          (click)="close()"
          class="block rounded-lg px-3 py-2 hover:bg-canvas"
          >Απόρρητο</a
        >
        <button
          type="button"
          (click)="logout()"
          class="block w-full rounded-lg px-3 py-2 text-left hover:bg-canvas"
        >
          Αποσύνδεση
        </button>
      </div>
    }
  `,
  styles: `
    /* Below its button, at the right edge. */
    .user-menu {
      position-area: bottom span-left;
      margin-top: 4px;
    }
    /* Browsers without anchor positioning: top right, under the header. */
    @supports not (position-area: bottom) {
      .user-menu {
        position: fixed;
        inset: 3.5rem 1rem auto auto;
      }
    }
  `,
})
export class UserMenu {
  protected readonly auth = inject(Auth);
  private readonly toasts = inject(Toasts);

  protected close(): void {
    document.getElementById('user-menu')?.hidePopover();
  }

  protected async logout(): Promise<void> {
    this.close();
    try {
      await this.auth.logout();
    } catch (error) {
      this.toasts.error('Η αποσύνδεση δεν έγινε', error, () => this.logout());
    }
  }
}
