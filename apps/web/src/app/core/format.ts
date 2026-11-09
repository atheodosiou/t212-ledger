import type { LedgerKind, SyncStatus } from '@t212/shared';

/** Tax years and dates follow Greek local time, like the exports. */
export const TIME_ZONE = 'Europe/Athens';

const moneyFormatters = new Map<string, Intl.NumberFormat>();
const qtyFormat = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 8 });
/** Share prices: always cents, more digits only when the price has them (penny stocks). */
const priceFormat = new Intl.NumberFormat('el-GR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const dateFormat = new Intl.DateTimeFormat('el-GR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const dateTimeFormat = new Intl.DateTimeFormat('el-GR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const yearFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric' });

export function money(value: string | number | null | undefined, currency = 'EUR'): string {
  if (value === null || value === undefined || value === '') return '—';
  let format = moneyFormatters.get(currency);
  if (!format) {
    format = new Intl.NumberFormat('el-GR', { style: 'currency', currency });
    moneyFormatters.set(currency, format);
  }
  return format.format(Number(value));
}

export function qty(value: string | null | undefined): string {
  return value === null || value === undefined ? '' : qtyFormat.format(Number(value));
}

export function price(value: string | null | undefined): string {
  return value === null || value === undefined ? '' : priceFormat.format(Number(value));
}

export function date(value: string | Date): string {
  return dateFormat.format(new Date(value));
}

export function dateTime(value: string | Date): string {
  return dateTimeFormat.format(new Date(value));
}

export function taxYear(value: string | Date): number {
  return Number(yearFormat.format(new Date(value)));
}

/** Sums decimal strings in integer cents to avoid floating point drift in totals. */
export function sumMoney(values: (string | null | undefined)[]): string {
  let cents = 0;
  for (const v of values) if (v) cents += Math.round(Number(v) * 100);
  return (cents / 100).toFixed(2);
}

/** Trading 212 internal tickers look like KO_US_EQ; show the first part. */
export function ticker(value: string | null | undefined): string {
  return value ? value.split('_')[0] : '';
}

export const KIND_LABEL: Record<LedgerKind, string> = {
  BUY: 'Αγορά',
  SELL: 'Πώληση',
  DEPOSIT: 'Κατάθεση',
  WITHDRAWAL: 'Ανάληψη',
  DIVIDEND: 'Μέρισμα',
  INTEREST: 'Τόκος',
  FEE: 'Χρέωση',
  TRANSFER: 'Εσωτερική μεταφορά',
  CORPORATE_ACTION: 'Εταιρική πράξη',
  OTHER: 'Άλλο',
};

export const SYNC_LABEL: Record<SyncStatus, string> = {
  IDLE: 'Ενημερωμένος',
  QUEUED: 'Σε αναμονή',
  RUNNING: 'Συγχρονισμός…',
  FAILED: 'Αποτυχία',
};

export function isSyncing(status: SyncStatus | undefined): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}

/** Reads the `message` of a Nest error response, whatever its shape. */
export function apiErrorMessage(
  error: unknown,
  fallback = 'Κάτι πήγε στραβά. Δοκίμασε ξανά.',
): string {
  const body = (error as { error?: { message?: string | string[] } })?.error;
  const message = body?.message;
  if (Array.isArray(message)) return message.join(' · ');
  return message || fallback;
}

const timeFormat = new Intl.DateTimeFormat('el-GR', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function timeOfDay(value: string | Date): string {
  return timeFormat.format(new Date(value));
}
