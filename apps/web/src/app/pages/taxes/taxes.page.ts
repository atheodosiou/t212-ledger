import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { InterestTreatment, TaxClass, TaxOverviewDto, TaxSettingsDto } from '@t212/shared';
import { Api } from '../../core/api';
import { date, money, qty, taxYear } from '../../core/format';
import { TAX_CLASS_LABEL } from '../../core/tax';
import { Toasts, toastOnError } from '../../core/toasts';

/** Ε1 codes that are informational rather than income (asset-acquisition justification). */
const JUSTIFICATION_CODES = new Set(['743', '781']);

/**
 * The Greek tax estimate for a year: what is due, what goes in each Ε1 code, where the
 * losses stand, and the rule behind each figure.
 */
@Component({
  selector: 'app-taxes-page',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './taxes.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaxesPage {
  private readonly api = inject(Api);
  private readonly toasts = inject(Toasts);

  /** null: the latest year with activity, as the API picks it. */
  protected readonly year = signal<number | null>(null);
  protected readonly tax = httpResource<TaxOverviewDto>(() => ({
    url: '/api/tax',
    params: this.year() ? { year: this.year()! } : undefined,
  }));
  protected readonly settings = httpResource<TaxSettingsDto>(() => '/api/tax/settings');

  /** Prior losses being edited, as typed. */
  protected readonly lossDrafts = linkedSignal(() =>
    (this.settings.hasValue() ? this.settings.value().priorLosses : []).map((l) => ({
      year: String(l.year),
      amount: l.amount,
    })),
  );
  protected readonly saving = signal(false);

  protected readonly currentYear = taxYear(new Date());
  protected readonly lossYears = Array.from({ length: 6 }, (_, i) => this.currentYear - 1 - i);

  protected readonly incomeCodes = computed(() =>
    this.tax.hasValue() ? this.tax.value().e1.filter((l) => !JUSTIFICATION_CODES.has(l.code)) : [],
  );
  protected readonly justificationCodes = computed(() =>
    this.tax.hasValue() ? this.tax.value().e1.filter((l) => JUSTIFICATION_CODES.has(l.code)) : [],
  );
  protected readonly taxableSales = computed(() =>
    this.tax.hasValue() ? this.tax.value().gains.lines.filter((l) => l.taxable) : [],
  );
  protected readonly exemptSales = computed(() =>
    this.tax.hasValue() ? this.tax.value().gains.lines.filter((l) => !l.taxable) : [],
  );

  protected readonly money = money;
  protected readonly qty = qty;
  protected readonly date = date;
  protected readonly Number = Number;
  protected readonly String = String;

  constructor() {
    toastOnError(this.tax, 'Ο υπολογισμός δεν φόρτωσε');
    toastOnError(this.settings, 'Οι ρυθμίσεις δεν φόρτωσαν');
  }

  protected classLabelOf(c: TaxClass): string {
    return TAX_CLASS_LABEL[c];
  }

  protected percent(rate: string): string {
    return `${Math.round(Number(rate) * 100)}%`;
  }

  protected async copy(code: string, amount: string): Promise<void> {
    const text = Number(amount).toFixed(2).replace('.', ',');
    try {
      await navigator.clipboard.writeText(text);
      this.toasts.success(`Αντιγράφηκε: ${text}`, `Κωδικός ${code}`);
    } catch (error) {
      this.toasts.error('Η αντιγραφή δεν έγινε', error);
    }
  }

  protected setInterest(interest: InterestTreatment): Promise<void> {
    return this.saveSettings({ interest }, 'Η ρύθμιση για τους τόκους αποθηκεύτηκε');
  }

  protected addLoss(): void {
    this.lossDrafts.update((l) => [...l, { year: String(this.currentYear - 1), amount: '' }]);
  }

  protected removeLoss(index: number): void {
    this.lossDrafts.update((l) => l.filter((_, i) => i !== index));
  }

  protected editLoss(index: number, field: 'year' | 'amount', value: string): void {
    this.lossDrafts.update((l) => l.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  }

  protected saveLosses(): Promise<void> {
    const priorLosses = this.lossDrafts()
      .filter((d) => d.amount.trim())
      .map((d) => ({ year: Number(d.year), amount: d.amount.trim().replace(',', '.') }));
    return this.saveSettings({ priorLosses }, 'Οι ζημιές αποθηκεύτηκαν');
  }

  private async saveSettings(change: Partial<TaxSettingsDto>, done: string): Promise<void> {
    this.saving.set(true);
    try {
      this.settings.set(await this.api.setTaxSettings(change));
      this.tax.reload();
      this.toasts.success(done);
    } catch (error) {
      this.toasts.error('Η ρύθμιση δεν αποθηκεύτηκε', error);
    } finally {
      this.saving.set(false);
    }
  }
}
