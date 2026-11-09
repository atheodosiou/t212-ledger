import { Decimal } from 'decimal.js';
import type { TaxClass, TaxProfile } from '../db/schema.js';
import type { RealisedSale } from '../ledger/cost-basis.js';
import type { DividendDetail } from '../ledger/dividends.js';

/**
 * Greek tax estimate for one calendar year, for an individual resident in Greece.
 * Rules and sources: docs/tax-research/reports/ and docs/tax-design.md. Amounts are
 * in EUR, as Trading 212 converted them. An estimate, not tax advice.
 */

export const DEFAULT_TAX_PROFILE: TaxProfile = {
  classes: {},
  interest: 'INTEREST',
  priorLosses: [],
};

/** Rates by tax year (art. 40 par. 1–2 and art. 43 ΚΦΕ). Known from 2020 on. */
const RATES: Record<
  number,
  { dividend: string; interest: string; gains: string }
> = {};
for (let y = 2020; y <= 2026; y++)
  RATES[y] = { dividend: '0.05', interest: '0.15', gains: '0.15' };

export const FIRST_TAX_YEAR = 2020;
export const LAST_KNOWN_TAX_YEAR = 2026;
/** The latest year whose Ε1 codes AADE has published (Ε1 instructions of 16.03.2026). */
export const E1_CODES_YEAR = 2025;
/** Losses carry forward this many years (art. 42 par. 5 ΚΦΕ). */
export const LOSS_CARRY_YEARS = 5;

/** Classes whose gains are taxed at 15% and whose losses carry forward. */
export const TAXABLE_GAIN_CLASSES: ReadonlySet<TaxClass> = new Set([
  'SHARE_QUALIFYING',
  'FUND_NON_EU',
  'ETC',
]);

const EEA = new Set(
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO'.split(
    ' ',
  ),
);
const ETC_NAME = /\b(ETC|ETN)\b|physical|bitcoin|ethereum|crypto/i;

/**
 * The class to suggest from Trading 212's metadata: shares are shares; a fund from the
 * EU/EEA is UCITS unless its name says it is a commodity or note; any other fund is a
 * fund from outside the EU. The user confirms or changes it.
 */
export function suggestTaxClass(meta: {
  isin: string | null;
  type: string | null;
  name: string | null;
}): TaxClass {
  if (meta.type !== 'ETF') return 'SHARE';
  if (meta.name && ETC_NAME.test(meta.name)) return 'ETC';
  const country = meta.isin?.slice(0, 2).toUpperCase() ?? '';
  return EEA.has(country) ? 'UCITS' : 'FUND_NON_EU';
}

export interface TaxInput {
  year: number;
  sales: RealisedSale[];
  dividends: DividendDetail[];
  interest: { date: Date; amount: string }[];
  /** Purchases of the year, fees included (for Ε1 code 743). */
  purchases: string;
  classOf: (isin: string | null) => TaxClass;
  profile: TaxProfile;
  /** Every year's net result of taxable sales, for the loss pool. */
  taxableNetByYear: Map<number, Decimal>;
  yearOf: (date: Date) => number;
}

export interface TaxSaleLine {
  entryId: string;
  date: Date;
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  taxClass: TaxClass;
  quantity: string;
  proceeds: string;
  costBasis: string;
  realisedPnl: string;
  taxable: boolean;
}

export interface TaxDividendLine {
  entryId: string;
  date: Date;
  ticker: string;
  isin: string | null;
  instrumentName: string | null;
  taxClass: TaxClass;
  gross: string | null;
  withheld: string | null;
  withholdingRate: string | null;
  greekTax: string;
  credit: string;
  due: string;
  exempt: boolean;
  adjustment: boolean;
  estimated: boolean;
  note: string | null;
}

export interface LossPoolEntry {
  originYear: number;
  /** The loss as it arose, positive. */
  amount: string;
  /** Used against gains in years up to and including this one. */
  used: string;
  remaining: string;
  /** The last year it can be used. */
  usableUntil: number;
  prior: boolean;
}

export interface E1Line {
  code: string;
  label: string;
  amount: string;
}

export interface TaxYear {
  year: number;
  supported: boolean;
  rates: { dividend: string; interest: string; gains: string };
  dividends: {
    lines: TaxDividendLine[];
    gross: string;
    withheld: string;
    adjustments: string;
    greekTax: string;
    credit: string;
    due: string;
    exemptGross: string;
    estimated: number;
  };
  interest: {
    gross: string;
    count: number;
    treatment: TaxProfile['interest'];
    tax: string;
  };
  gains: {
    lines: TaxSaleLine[];
    exemptGains: string;
    exemptLosses: string;
    taxableGains: string;
    taxableLosses: string;
    taxableNet: string;
    lossesUsed: string;
    taxableAfterLosses: string;
    tax: string;
    unmatched: number;
  };
  losses: {
    pool: LossPoolEntry[];
    available: string;
    expiring: string;
  };
  justification: { purchases: string; capitalReturned: string };
  e1: E1Line[];
  totalDue: string;
}

const ZERO = new Decimal(0);
const sum = (values: Decimal[]) => values.reduce((a, b) => a.plus(b), ZERO);
const cents = (d: Decimal) => d.toFixed(2);
const round = (d: Decimal) => d.toDecimalPlaces(2);

export function computeTaxYear(input: TaxInput): TaxYear {
  const { year, profile } = input;
  const rates = RATES[year] ?? RATES[LAST_KNOWN_TAX_YEAR];

  // Dividends (art. 40 par. 1, art. 9 par. 2): 5% of the gross, less the tax withheld
  // abroad, capped per dividend at the Greek tax on it.
  const dividendLines: TaxDividendLine[] = input.dividends
    .filter((d) => input.yearOf(d.date) === year)
    .map((d) => {
      const taxClass = input.classOf(d.isin);
      const adjustment = d.source === 'adjustment';
      const exempt = taxClass === 'UCITS' && !adjustment;
      const gross = d.grossAccount ? new Decimal(d.grossAccount) : null;
      const withheld = d.withheld ? new Decimal(d.withheld) : ZERO;
      const greekTax =
        exempt || adjustment || !gross
          ? ZERO
          : round(gross.times(rates.dividend));
      const credit = adjustment
        ? ZERO
        : Decimal.min(Decimal.max(withheld, 0), greekTax);
      return {
        entryId: d.entryId,
        date: d.date,
        ticker: d.ticker,
        isin: d.isin,
        instrumentName: d.instrumentName,
        taxClass,
        gross: gross ? cents(gross) : null,
        withheld: d.withheld ? cents(withheld) : null,
        withholdingRate: d.withholdingRate,
        greekTax: cents(greekTax),
        credit: cents(credit),
        due: cents(greekTax.minus(credit)),
        exempt,
        adjustment,
        estimated: d.estimated,
        note: d.note,
      };
    });
  const taxedDividends = dividendLines.filter(
    (l) => !l.exempt && !l.adjustment,
  );
  const dividendGross = sum(
    taxedDividends.map((l) => new Decimal(l.gross ?? 0)),
  );
  const dividendWithheld = sum(
    taxedDividends.map((l) => new Decimal(l.withheld ?? 0)),
  );
  const adjustments = sum(
    dividendLines
      .filter((l) => l.adjustment)
      .map((l) => new Decimal(l.withheld ?? 0)),
  );
  const dividendTax = sum(taxedDividends.map((l) => new Decimal(l.greekTax)));
  // A refund of withheld tax lowers what can be credited, never below zero.
  const dividendCredit = Decimal.max(
    0,
    Decimal.min(
      sum(taxedDividends.map((l) => new Decimal(l.credit))),
      dividendWithheld.plus(adjustments),
    ),
  );
  const dividendDue = dividendTax.minus(dividendCredit);
  const exemptDividends = sum(
    dividendLines.filter((l) => l.exempt).map((l) => new Decimal(l.gross ?? 0)),
  );

  // Interest on cash (art. 40 par. 2): 15%, paid gross by Trading 212.
  const interestItems = input.interest.filter(
    (i) => input.yearOf(i.date) === year,
  );
  const interestGross = sum(interestItems.map((i) => new Decimal(i.amount)));
  const interestTax =
    profile.interest === 'INTEREST'
      ? round(interestGross.times(rates.interest))
      : ZERO;

  // Sales (art. 42): exempt classes report their gains; taxable classes are netted for the
  // year, and a net gain is reduced by losses of the previous five years.
  const saleLines: TaxSaleLine[] = input.sales
    .filter((s) => input.yearOf(s.date) === year)
    .map((s) => {
      const taxClass = input.classOf(s.isin);
      return {
        entryId: s.entryId,
        date: s.date,
        ticker: s.ticker,
        isin: s.isin,
        instrumentName: s.instrumentName,
        taxClass,
        quantity: s.quantity,
        proceeds: s.proceeds,
        costBasis: s.costBasis,
        realisedPnl: s.realisedPnl,
        taxable: TAXABLE_GAIN_CLASSES.has(taxClass),
      };
    });
  const pnls = (taxable: boolean, sign: 1 | -1) =>
    sum(
      saleLines
        .filter((l) => l.taxable === taxable)
        .map((l) => new Decimal(l.realisedPnl))
        .filter((p) => (sign > 0 ? p.gt(0) : p.lt(0))),
    ).abs();
  const taxableGains = pnls(true, 1);
  const taxableLosses = pnls(true, -1);
  const taxableNet = taxableGains.minus(taxableLosses);

  const pool = lossPool(input.taxableNetByYear, profile.priorLosses, year);
  const available = sum(
    pool.filter((p) => p.originYear < year).map((p) => p.remainingBefore),
  );
  const lossesUsed = pool.reduce((s, p) => s.plus(p.usedThisYear), ZERO);
  const taxableAfterLosses = Decimal.max(0, taxableNet.minus(lossesUsed));
  const gainsTax = round(taxableAfterLosses.times(rates.gains));

  const purchases = new Decimal(input.purchases);
  const capitalReturned = sum(saleLines.map((l) => new Decimal(l.costBasis)));
  const exemptGains = pnls(false, 1);

  const interestCode = profile.interest === 'INTEREST' ? interestGross : ZERO;
  const exempt659 = exemptGains
    .plus(exemptDividends)
    .plus(profile.interest === 'EXEMPT' ? interestGross : ZERO);
  const carried = sum(
    pool.filter((p) => p.originYear < year).map((p) => p.remainingBefore),
  );
  const e1: E1Line[] = [
    {
      code: '295',
      label: 'Μερίσματα αλλοδαπής (μικτά)',
      amount: cents(dividendGross),
    },
    {
      code: '669',
      label: 'Τόκοι αλλοδαπής (μικτοί)',
      amount: cents(interestCode),
    },
    {
      code: '683',
      label: 'Φόρος που παρακρατήθηκε στο εξωτερικό (όσος συμψηφίζεται)',
      amount: cents(dividendCredit),
    },
    {
      code: '659',
      label: 'Απαλλασσόμενα: κέρδη μετοχών <0,5%, UCITS',
      amount: cents(exempt659),
    },
    {
      code: '865',
      label: 'Υπεραξία από τίτλους αλλοδαπής (φορολογητέα)',
      amount: cents(Decimal.max(0, taxableNet)),
    },
    {
      code: '871',
      label: 'Ζημιά του έτους από φορολογητέους τίτλους',
      amount: cents(Decimal.max(0, taxableNet.neg())),
    },
    {
      code: '873',
      label: 'Ζημιές προηγούμενων ετών (έως 5)',
      amount: cents(carried),
    },
    {
      code: '743',
      label: 'Αγορές μετοχών και τίτλων',
      amount: cents(purchases),
    },
    {
      code: '781',
      label: 'Κεφάλαιο που επέστρεψε από πωλήσεις',
      amount: cents(capitalReturned),
    },
  ];

  return {
    year,
    supported: year >= FIRST_TAX_YEAR,
    rates,
    dividends: {
      lines: dividendLines,
      gross: cents(dividendGross),
      withheld: cents(dividendWithheld),
      adjustments: cents(adjustments),
      greekTax: cents(dividendTax),
      credit: cents(dividendCredit),
      due: cents(dividendDue),
      exemptGross: cents(exemptDividends),
      estimated: dividendLines.filter((l) => l.estimated).length,
    },
    interest: {
      gross: cents(interestGross),
      count: interestItems.length,
      treatment: profile.interest,
      tax: cents(interestTax),
    },
    gains: {
      lines: saleLines,
      exemptGains: cents(exemptGains),
      exemptLosses: cents(pnls(false, -1)),
      taxableGains: cents(taxableGains),
      taxableLosses: cents(taxableLosses),
      taxableNet: cents(taxableNet),
      lossesUsed: cents(lossesUsed),
      taxableAfterLosses: cents(taxableAfterLosses),
      tax: cents(gainsTax),
      unmatched: input.sales.filter(
        (s) =>
          input.yearOf(s.date) === year &&
          new Decimal(s.unmatchedQuantity).gt(0),
      ).length,
    },
    losses: {
      pool: pool.map((p) => ({
        originYear: p.originYear,
        amount: cents(p.amount),
        used: cents(p.amount.minus(p.remainingAfter)),
        remaining: cents(p.remainingAfter),
        usableUntil: p.originYear + LOSS_CARRY_YEARS,
        prior: p.prior,
      })),
      available: cents(available),
      expiring: cents(
        sum(
          pool
            .filter((p) => p.originYear + LOSS_CARRY_YEARS === year)
            .map((p) => p.remainingAfter),
        ),
      ),
    },
    justification: {
      purchases: cents(purchases),
      capitalReturned: cents(capitalReturned),
    },
    e1,
    totalDue: cents(dividendDue.plus(interestTax).plus(gainsTax)),
  };
}

interface PoolState {
  originYear: number;
  amount: Decimal;
  prior: boolean;
  /** Left at the start of the target year. */
  remainingBefore: Decimal;
  /** Used in the target year. */
  usedThisYear: Decimal;
  /** Left at the end of the target year. */
  remainingAfter: Decimal;
}

/**
 * Replays the loss pool up to `target` (art. 42 par. 5): a year's net loss on taxable
 * securities can reduce net gains of the next five years, oldest losses first. Returns
 * the losses still relevant to `target`: arisen before it and not expired, or arisen in it.
 */
export function lossPool(
  netByYear: Map<number, Decimal>,
  priorLosses: TaxProfile['priorLosses'],
  target: number,
): PoolState[] {
  const entries: {
    originYear: number;
    amount: Decimal;
    remaining: Decimal;
    prior: boolean;
  }[] = [];
  for (const p of priorLosses) {
    const amount = new Decimal(p.amount).abs();
    if (amount.gt(0))
      entries.push({
        originYear: p.year,
        amount,
        remaining: amount,
        prior: true,
      });
  }
  const years = [
    ...netByYear.keys(),
    ...priorLosses.map((p) => p.year),
    target,
  ];
  const first = Math.min(...years);
  let result: PoolState[] = [];
  for (let y = first; y <= target; y++) {
    const net = netByYear.get(y) ?? ZERO;
    const usable = entries
      .filter((e) => e.originYear < y && e.originYear + LOSS_CARRY_YEARS >= y)
      .sort((a, b) => a.originYear - b.originYear);
    const before = new Map(usable.map((e) => [e, e.remaining]));
    let gain = Decimal.max(0, net);
    const used = new Map<(typeof entries)[number], Decimal>();
    for (const e of usable) {
      if (gain.lte(0)) break;
      const take = Decimal.min(gain, e.remaining);
      e.remaining = e.remaining.minus(take);
      gain = gain.minus(take);
      used.set(e, take);
    }
    if (net.lt(0)) {
      const amount = net.abs();
      const existing = entries.find((e) => e.originYear === y && !e.prior);
      if (!existing)
        entries.push({
          originYear: y,
          amount,
          remaining: amount,
          prior: false,
        });
    }
    if (y === target) {
      result = entries
        .filter(
          (e) => e.originYear <= y && e.originYear + LOSS_CARRY_YEARS >= y,
        )
        .sort(
          (a, b) =>
            a.originYear - b.originYear || Number(a.prior) - Number(b.prior),
        )
        .map((e) => ({
          originYear: e.originYear,
          amount: e.amount,
          prior: e.prior,
          remainingBefore:
            e.originYear < y ? (before.get(e) ?? e.remaining) : ZERO,
          usedThisYear: used.get(e) ?? ZERO,
          remainingAfter: e.remaining,
        }));
    }
  }
  return result;
}

export const TAX_CLASS_LABEL: Record<TaxClass, string> = {
  SHARE: 'Μετοχή (<0,5%)',
  SHARE_QUALIFYING: 'Μετοχή (≥0,5%)',
  UCITS: 'UCITS ΕΕ/ΕΟΧ',
  FUND_NON_EU: 'Ταμείο εκτός ΕΕ',
  ETC: 'ETC / ETN',
};
