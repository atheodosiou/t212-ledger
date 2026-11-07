import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, minLength, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import type { AccountDto, BrokerEnvironment } from '@t212/shared';
import { Api } from '../../core/api';
import { whileActive } from '../../core/poll';
import { apiErrorMessage, dateTime, isSyncing, SYNC_LABEL } from '../../core/format';

interface ConnectModel {
  label: string;
  environment: BrokerEnvironment;
  apiKey: string;
  apiSecret: string;
}

@Component({
  selector: 'app-accounts-page',
  imports: [RouterLink, FormField, FormRoot],
  templateUrl: './accounts.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountsPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  protected readonly accounts = httpResource<AccountDto[]>(() => '/api/accounts');
  protected readonly serverError = signal<string | null>(null);

  constructor() {
    // Keep sync statuses current without a page refresh.
    whileActive(
      () => this.accounts.hasValue() && this.accounts.value().some((a) => isSyncing(a.syncStatus)),
      3000,
      () => this.accounts.reload(),
    );
  }

  protected readonly model = signal<ConnectModel>({
    label: '',
    environment: 'DEMO',
    apiKey: '',
    apiSecret: '',
  });
  protected readonly connectForm = form(
    this.model,
    (path) => {
      required(path.label, { message: 'Δώσε ένα όνομα, π.χ. «Practice» ή «Κύριος».' });
      maxLength(path.label, 60, { message: 'Μέχρι 60 χαρακτήρες.' });
      required(path.apiKey, { message: 'Επικόλλησε το API key.' });
      minLength(path.apiKey, 10, { message: 'Το key φαίνεται πολύ μικρό.' });
      required(path.apiSecret, { message: 'Επικόλλησε το API secret.' });
      minLength(path.apiSecret, 10, { message: 'Το secret φαίνεται πολύ μικρό.' });
    },
    {
      submission: {
        action: async (field) => {
          this.serverError.set(null);
          try {
            const account = await this.api.createAccount(field().value());
            this.model.set({ label: '', environment: 'DEMO', apiKey: '', apiSecret: '' });
            await this.router.navigate(['/accounts', account.id]);
            return;
          } catch (error) {
            this.serverError.set(apiErrorMessage(error));
            return { kind: 'server', message: apiErrorMessage(error) };
          }
        },
      },
    },
  );

  protected readonly syncLabel = SYNC_LABEL;
  protected readonly isSyncing = isSyncing;
  protected readonly dateTime = dateTime;
}
