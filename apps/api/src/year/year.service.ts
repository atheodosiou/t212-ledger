import { Injectable } from '@nestjs/common';
import { dividendDetails } from '../ledger/dividends.js';
import { DEFAULT_TAX_TIME_ZONE, taxYearOf } from '../ledger/cost-basis.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { TaxService } from '../tax/tax.service.js';
import {
  buildYearReview,
  yearsWithActivity,
  type AccountHistory,
  type YearReview,
} from './year-review.js';

export interface YearOverview extends YearReview {
  years: number[];
  accounts: { id: string; label: string }[];
  excluded: { id: string; label: string; reason: string }[];
  /** Greek tax due for the year (see the Taxes page). */
  taxDue: string | null;
}

@Injectable()
export class YearService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly tax: TaxService,
  ) {}

  async overview(userId: string, year: number | null): Promise<YearOverview> {
    const { accounts, excluded } = await this.tax.accounts(userId);
    const histories: AccountHistory[] = [];
    for (const account of accounts) {
      const entries = await this.ledger.list(account.id);
      histories.push({
        entries,
        dividends: dividendDetails(
          entries,
          account.accountCurrency,
          await this.ledger.dividendExportRows(account.id),
        ),
        charges: await this.ledger.fillCharges(account.id),
      });
    }
    const years = yearsWithActivity(histories);
    const target =
      year ?? years[0] ?? taxYearOf(DEFAULT_TAX_TIME_ZONE)(new Date());
    const review = buildYearReview(target, histories, { now: new Date() });
    const taxDue = years.includes(target)
      ? (await this.tax.overview(userId, target)).totalDue
      : null;
    return {
      ...review,
      years,
      accounts: accounts.map((a) => ({ id: a.id, label: a.label })),
      excluded: excluded.map((e) => ({
        id: e.account.id,
        label: e.account.label,
        reason: e.reason,
      })),
      taxDue,
    };
  }
}
