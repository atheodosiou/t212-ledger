import type { BreakdownKey } from '@t212/shared';
import { money } from '../../core/format';

export const BREAKDOWN_TEXT: Record<BreakdownKey, { label: string; short: string; hint: string }> =
  {
    realised: {
      label: 'Μετοχές που πούλησες',
      short: 'Πουλημένες',
      hint: 'Κέρδος ή ζημιά από όσα έχεις ήδη πουλήσει, μετά τις χρεώσεις.',
    },
    unrealised: {
      label: 'Μετοχές που κρατάς',
      short: 'Ανοιχτές',
      hint: 'Τρέχουσα αξία μείον κόστος αγοράς. Γίνεται οριστικό μόνο αν πουλήσεις.',
    },
    dividends: {
      label: 'Μερίσματα',
      short: 'Μερίσματα',
      hint: 'Καθαρά, μετά τον φόρο που παρακρατήθηκε.',
    },
    interest: { label: 'Τόκοι', short: 'Τόκοι', hint: 'Τόκοι στα αδιάθετα μετρητά.' },
    fees: {
      label: 'Χρεώσεις καταθέσεων',
      short: 'Χρεώσεις',
      hint: 'Χρεώσεις που δεν αφορούν συναλλαγή. Οι χρεώσεις αγορών και πωλήσεων είναι ήδη μέσα στις γραμμές πάνω.',
    },
    other: {
      label: 'Άλλες κινήσεις',
      short: 'Άλλα',
      hint: 'Κινήσεις μετρητών που δεν ανήκουν σε άλλη κατηγορία.',
    },
  };

export function signedMoney(value: string, currency: string): string {
  return `${Number(value) > 0 ? '+' : ''}${money(value, currency)}`;
}

export function signedPct(pct: string): string {
  return `${Number(pct) > 0 ? '+' : ''}${pct.replace('.', ',')}`;
}

/** Whole euros with sign, for the compact bar. */
export function signedCompact(value: string, currency: string): string {
  const n = Math.round(Number(value));
  const formatted = new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n);
  return `${n > 0 ? '+' : ''}${formatted}`;
}
