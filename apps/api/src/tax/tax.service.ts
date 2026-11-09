import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Decimal } from 'decimal.js';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '../db/db.js';
import {
  brokerAccounts,
  instruments,
  ledgerEntries,
  taxProfiles,
  type BrokerAccount,
  type TaxClass,
  type TaxProfile,
} from '../db/schema.js';
import {
  computeCostBasis,
  DEFAULT_TAX_TIME_ZONE,
  taxYearOf,
  type RealisedSale,
} from '../ledger/cost-basis.js';
import { dividendDetails, type DividendDetail } from '../ledger/dividends.js';
import { LedgerService } from '../ledger/ledger.service.js';
import {
  computeTaxYear,
  DEFAULT_TAX_PROFILE,
  E1_CODES_YEAR,
  suggestTaxClass,
  TAXABLE_GAIN_CLASSES,
  type TaxYear,
} from './tax.js';

/** The tax estimate covers live accounts kept in euro: the amounts it needs are in EUR. */
const TAX_CURRENCY = 'EUR';

export interface TaxInstrument {
  isin: string;
  ticker: string;
  name: string | null;
  type: string | null;
  suggested: TaxClass;
  taxClass: TaxClass;
  /** The user chose the class (or confirmed the suggestion). */
  confirmed: boolean;
}

export interface TaxOverview extends TaxYear {
  accounts: { id: string; label: string }[];
  excluded: { id: string; label: string; reason: string }[];
  years: number[];
  e1CodesYear: number;
  unconfirmed: number;
  warnings: string[];
}

interface UserHistory {
  accounts: BrokerAccount[];
  excluded: { account: BrokerAccount; reason: string }[];
  sales: RealisedSale[];
  dividends: DividendDetail[];
  interest: { date: Date; amount: string }[];
  purchasesByYear: Map<number, Decimal>;
  years: Set<number>;
  engineWarnings: string[];
}

@Injectable()
export class TaxService {
  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly ledger: LedgerService,
  ) {}

  async profile(userId: string): Promise<TaxProfile> {
    const [row] = await this.db
      .select({ profile: taxProfiles.profile })
      .from(taxProfiles)
      .where(eq(taxProfiles.userId, userId));
    return { ...DEFAULT_TAX_PROFILE, ...row?.profile };
  }

  async updateProfile(
    userId: string,
    change: (profile: TaxProfile) => TaxProfile,
  ): Promise<TaxProfile> {
    const profile = change(await this.profile(userId));
    await this.db
      .insert(taxProfiles)
      .values({ userId, profile })
      .onConflictDoUpdate({
        target: taxProfiles.userId,
        set: { profile, updatedAt: new Date() },
      });
    return profile;
  }

  /** Every instrument the user has traded or held, with its tax class. */
  async instruments(userId: string): Promise<TaxInstrument[]> {
    const { accounts } = await this.accounts(userId);
    if (!accounts.length) return [];
    const profile = await this.profile(userId);
    const rows = await this.db
      .selectDistinct({
        isin: ledgerEntries.isin,
        ticker: ledgerEntries.ticker,
        displayTicker: ledgerEntries.displayTicker,
        entryName: ledgerEntries.instrumentName,
        name: instruments.name,
        type: instruments.type,
      })
      .from(ledgerEntries)
      .leftJoin(instruments, eq(instruments.ticker, ledgerEntries.ticker))
      .where(
        and(
          inArray(
            ledgerEntries.accountId,
            accounts.map((a) => a.id),
          ),
          isNotNull(ledgerEntries.isin),
          inArray(ledgerEntries.kind, [
            'BUY',
            'SELL',
            'DIVIDEND',
            'CORPORATE_ACTION',
          ]),
        ),
      );
    // One row per ISIN: the same fund trades under several tickers (VWCE, VWRA, VWRP).
    const byIsin = new Map<string, TaxInstrument>();
    for (const r of rows) {
      const isin = r.isin!;
      const existing = byIsin.get(isin);
      const type = existing?.type ?? r.type;
      const name = existing?.name ?? r.name ?? r.entryName;
      const suggested = suggestTaxClass({ isin, type, name });
      const chosen = profile.classes[isin];
      byIsin.set(isin, {
        isin,
        ticker: existing?.ticker ?? r.displayTicker ?? r.ticker ?? isin,
        name,
        type,
        suggested,
        taxClass: chosen ?? suggested,
        confirmed: chosen !== undefined,
      });
    }
    return [...byIsin.values()].sort(
      (a, b) =>
        Number(a.confirmed) - Number(b.confirmed) ||
        a.taxClass.localeCompare(b.taxClass) ||
        a.ticker.localeCompare(b.ticker),
    );
  }

  async overview(userId: string, year: number | null): Promise<TaxOverview> {
    const yearOf = taxYearOf(DEFAULT_TAX_TIME_ZONE);
    const [history, list, profile] = await Promise.all([
      this.history(userId),
      this.instruments(userId),
      this.profile(userId),
    ]);
    const classes = new Map(list.map((i) => [i.isin, i.taxClass]));
    const classOf = (isin: string | null): TaxClass =>
      (isin && classes.get(isin)) || 'SHARE';

    const years = [...history.years].sort((a, b) => b - a);
    const target = year ?? years[0] ?? Number(yearOf(new Date()));

    const taxableNetByYear = new Map<number, Decimal>();
    for (const s of history.sales) {
      if (!TAXABLE_GAIN_CLASSES.has(classOf(s.isin))) continue;
      const y = yearOf(s.date);
      taxableNetByYear.set(
        y,
        (taxableNetByYear.get(y) ?? new Decimal(0)).plus(s.realisedPnl),
      );
    }

    const result = computeTaxYear({
      year: target,
      sales: history.sales,
      dividends: history.dividends,
      interest: history.interest,
      purchases: (
        history.purchasesByYear.get(target) ?? new Decimal(0)
      ).toFixed(2),
      classOf,
      profile,
      taxableNetByYear,
      yearOf,
    });

    const warnings = [...history.engineWarnings];
    if (result.gains.unmatched)
      warnings.push(
        `${result.gains.unmatched} πωλήσεις έχουν μετοχές χωρίς αγορά στο ιστορικό (π.χ. μεταφορά από άλλον broker): το κόστος τους λείπει.`,
      );
    if (result.dividends.estimated)
      warnings.push(
        `${result.dividends.estimated} μερίσματα δεν έχουν ακόμα το export του Trading 212: ο φόρος που κρατήθηκε είναι εκτίμηση.`,
      );

    return {
      ...result,
      accounts: history.accounts.map((a) => ({ id: a.id, label: a.label })),
      excluded: history.excluded.map((e) => ({
        id: e.account.id,
        label: e.account.label,
        reason: e.reason,
      })),
      years,
      e1CodesYear: E1_CODES_YEAR,
      unconfirmed: list.filter((i) => !i.confirmed).length,
      warnings,
    };
  }

  private async accounts(userId: string) {
    const all = await this.db
      .select()
      .from(brokerAccounts)
      .where(eq(brokerAccounts.userId, userId));
    const accounts: BrokerAccount[] = [];
    const excluded: { account: BrokerAccount; reason: string }[] = [];
    for (const a of all) {
      if (a.environment !== 'LIVE')
        excluded.push({
          account: a,
          reason: 'Λογαριασμός επίδειξης (Practice)',
        });
      else if (a.accountCurrency !== TAX_CURRENCY)
        excluded.push({
          account: a,
          reason: `Νόμισμα λογαριασμού ${a.accountCurrency}: ο υπολογισμός γίνεται μόνο σε EUR`,
        });
      else accounts.push(a);
    }
    return { accounts, excluded };
  }

  /** The whole history of every eligible account: cost basis needs all of it. */
  private async history(userId: string): Promise<UserHistory> {
    const { accounts, excluded } = await this.accounts(userId);
    const out: UserHistory = {
      accounts,
      excluded,
      sales: [],
      dividends: [],
      interest: [],
      purchasesByYear: new Map(),
      years: new Set(),
      engineWarnings: [],
    };
    for (const account of accounts) {
      const entries = await this.ledger.list(account.id);
      // Average cost, the method art. 42 par. 4 ΚΦΕ prescribes (and Trading 212 uses).
      const engine = computeCostBasis(entries, 'AVERAGE');
      out.sales.push(...engine.sales);
      for (const y of engine.years) {
        out.years.add(y.year);
        out.purchasesByYear.set(
          y.year,
          (out.purchasesByYear.get(y.year) ?? new Decimal(0)).plus(y.purchases),
        );
      }
      out.dividends.push(
        ...dividendDetails(
          entries,
          account.accountCurrency,
          await this.ledger.dividendExportRows(account.id),
        ),
      );
      for (const e of entries)
        if (e.kind === 'INTEREST')
          out.interest.push({ date: e.occurredAt, amount: e.cashAmount });
      if (engine.warnings.length)
        out.engineWarnings.push(
          `${account.label}: ${engine.warnings.length} κινήσεις χρειάζονται έλεγχο (εταιρικές πράξεις ή μετοχές χωρίς αγορά).`,
        );
    }
    return out;
  }
}
