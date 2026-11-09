import type { TaxClass } from '@t212/shared';

export const TAX_CLASSES: TaxClass[] = ['SHARE', 'UCITS', 'ETC', 'FUND_NON_EU', 'SHARE_QUALIFYING'];

export const TAX_CLASS_LABEL: Record<TaxClass, string> = {
  SHARE: 'Μετοχή',
  SHARE_QUALIFYING: 'Μετοχή, συμμετοχή ≥0,5%',
  UCITS: 'UCITS (ΕΕ/ΕΟΧ)',
  FUND_NON_EU: 'Ταμείο εκτός ΕΕ',
  ETC: 'ETC / ETN',
};

export const TAX_CLASS_HINT: Record<TaxClass, string> = {
  SHARE:
    'Εισηγμένη μετοχή, σε οποιοδήποτε χρηματιστήριο, όταν κατέχεις λιγότερο από 0,5% της εταιρείας. Κέρδη αφορολόγητα (δηλώνονται στον 659), μερίσματα 5%.',
  SHARE_QUALIFYING: 'Κατέχεις 0,5% ή περισσότερο της εταιρείας. Κέρδη 15% (865), μερίσματα 5%.',
  UCITS:
    'ETF ή αμοιβαίο UCITS με έδρα στην ΕΕ/ΕΟΧ (ISIN που αρχίζει από IE, LU, DE…). Κέρδη και διανομές αφορολόγητα (659).',
  FUND_NON_EU:
    'Ταμείο με έδρα εκτός ΕΕ/ΕΟΧ, π.χ. αμερικανικό ETF (ISIN US…). Κέρδη 15% (865), διανομές 5%.',
  ETC: 'Exchange-traded commodity ή note, π.χ. φυσικός χρυσός ή bitcoin. Δεν είναι UCITS: κέρδη 15% (865).',
};

/** Whether gains of the class are taxed (and its losses carry forward). */
export function taxableClass(c: TaxClass): boolean {
  return c === 'ETC' || c === 'FUND_NON_EU' || c === 'SHARE_QUALIFYING';
}
