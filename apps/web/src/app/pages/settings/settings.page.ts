import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../../core/auth';
import { downloadFile } from '../../core/download';
import { apiErrorMessage } from '../../core/format';
import { Toasts } from '../../core/toasts';

/** The user's account: sign-in, their data (download, delete). */
@Component({
  selector: 'app-settings-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      routerLink="/"
      class="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-muted hover:text-ink"
      >‹ Λογαριασμοί</a
    >
    <h1 class="text-2xl font-semibold tracking-tight">Ο λογαριασμός μου</h1>

    <div class="mt-6 grid max-w-2xl gap-5">
      <section class="rounded-xl border border-line bg-surface p-5">
        <h2 class="font-semibold">Σύνδεση</h2>
        <p class="mt-1 text-sm text-muted">
          Συνδεδεμένος ως <span class="font-medium text-ink">{{ auth.user()?.email }}</span>
        </p>
        <button
          type="button"
          (click)="logoutEverywhere()"
          [disabled]="busy()"
          class="mt-4 rounded-lg border border-line px-3 py-2 text-sm font-medium transition hover:border-brand/40 disabled:opacity-50"
        >
          Αποσύνδεση από όλες τις συσκευές
        </button>
      </section>

      <section class="rounded-xl border border-line bg-surface p-5">
        <h2 class="font-semibold">Τα δεδομένα μου</h2>
        <p class="mt-1 text-sm text-muted">
          Ένα αρχείο JSON με ό,τι κρατάμε για σένα: λογαριασμούς, όλο το ιστορικό όπως ήρθε από το
          Trading 212, τις κινήσεις που βγάζουμε από αυτό και τις συνδέσεις σου. Τα API keys δεν
          περιλαμβάνονται.
        </p>
        <button
          type="button"
          (click)="downloadData()"
          [disabled]="exporting()"
          class="mt-4 inline-block rounded-lg border border-line px-3 py-2 text-sm font-medium transition hover:border-brand/40 disabled:opacity-50"
        >
          {{ exporting() ? 'Ετοιμάζεται…' : '⤓ Λήψη των δεδομένων μου' }}
        </button>
      </section>

      <section class="rounded-xl border border-loss/30 bg-surface p-5">
        <h2 class="font-semibold text-loss">Διαγραφή λογαριασμού</h2>
        <p class="mt-1 text-sm text-muted">
          Διαγράφει οριστικά τον λογαριασμό σου, τους συνδεδεμένους λογαριασμούς Trading 212 με τα
          API keys τους, όλο το ιστορικό και τις αναφορές. Δεν αναιρείται. Τα ημερήσια αντίγραφα
          ασφαλείας σβήνονται μόνα τους μέσα σε 14 ημέρες. Το Trading 212 δεν επηρεάζεται.
        </p>
        <label class="mt-4 block text-sm">
          Γράψε <span class="font-medium">{{ auth.user()?.email }}</span> για επιβεβαίωση
          <input
            type="email"
            autocomplete="off"
            [value]="confirm()"
            (input)="confirm.set($any($event.target).value)"
            class="mt-1 block w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm"
          />
        </label>
        @if (error()) {
          <p role="alert" class="mt-2 text-sm text-loss">{{ error() }}</p>
        }
        <button
          type="button"
          (click)="erase()"
          [disabled]="!matches() || busy()"
          class="mt-3 rounded-lg bg-loss px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          Οριστική διαγραφή
        </button>
      </section>
    </div>
  `,
})
export class SettingsPage {
  protected readonly auth = inject(Auth);
  private readonly http = inject(HttpClient);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirm = signal('');
  protected readonly matches = computed(
    () => this.confirm().trim().toLowerCase() === this.auth.user()?.email,
  );

  private readonly toasts = inject(Toasts);
  protected readonly exporting = signal(false);

  protected async downloadData(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      await downloadFile('/api/me/export', 't212-ledger-data.json');
    } catch (error) {
      this.toasts.error('Τα δεδομένα σου δεν κατέβηκαν', error, () => this.downloadData());
    } finally {
      this.exporting.set(false);
    }
  }

  protected async logoutEverywhere(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.logoutEverywhere();
    } catch (error) {
      this.toasts.error('Η αποσύνδεση δεν έγινε', error, () => this.logoutEverywhere());
    } finally {
      this.busy.set(false);
    }
  }

  protected async erase(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.delete<void>('/api/me', { body: { confirmEmail: this.confirm() } }),
      );
      this.auth.signedOut();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
