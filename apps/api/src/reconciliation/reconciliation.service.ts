import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Decimal } from 'decimal.js';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/db.js';
import {
  brokerAccounts,
  ledgerEntries,
  rawEvents,
  type BrokerAccount,
} from '../db/schema.js';
import { computeCostBasis } from '../ledger/cost-basis.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { checkRaw } from '../ledger/raw-schemas.js';
import { PortfolioService } from '../portfolio/portfolio.service.js';
import { InstrumentsService } from '../trading212/instruments.service.js';
import { reconcile, type Reconciliation } from './reconcile.js';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly portfolio: PortfolioService,
    private readonly instruments: InstrumentsService,
  ) {}

  /**
   * Compares the stored history with Trading 212 and saves the result on the account.
   * Never throws: a check that cannot run marks the previous result as stale so the
   * next sync tries again.
   */
  async run(account: BrokerAccount): Promise<Reconciliation | null> {
    try {
      const { snapshot, stale } = await this.portfolio.live(account, true);
      // A cached snapshot may predate the trades just synced; comparing would raise false alarms.
      if (stale)
        throw new Error('Trading 212 returned cached data (rate limited)');

      const entries = await this.ledger.list(account.id);
      const engine = computeCostBasis(entries, 'AVERAGE');
      const ledgerCash = entries
        .reduce((sum, e) => sum.plus(e.cashAmount), new Decimal(0))
        .toFixed(2);

      const result = reconcile({
        holdings: engine.holdings,
        positions: snapshot.positions,
        summary: snapshot.summary,
        ledgerCash,
        displayTickers: await this.instruments.displayTickers(
          snapshot.positions.map((p) => p.instrument.ticker),
        ),
        unreadable: await this.unreadable(account.id),
        unmapped: await this.unmapped(account.id),
        warnings: engine.warnings,
        now: new Date(),
      });
      await this.save(account.id, result);
      if (!result.ok) {
        this.logger.warn(
          `Account ${account.id}: reconciliation found ${result.issues.length} issue(s)`,
        );
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Account ${account.id}: reconciliation could not run: ${message}`,
      );
      if (account.reconciliation)
        await this.save(account.id, { ...account.reconciliation, stale: true });
      return null;
    }
  }

  /** Stored records with no ledger entry that are not simply cancelled orders. */
  private async unreadable(accountId: string) {
    const orphans = await this.db
      .select({
        source: rawEvents.source,
        externalId: rawEvents.externalId,
        payload: rawEvents.payload,
      })
      .from(rawEvents)
      .leftJoin(ledgerEntries, eq(ledgerEntries.rawEventId, rawEvents.id))
      .where(and(eq(rawEvents.accountId, accountId), isNull(ledgerEntries.id)));
    return orphans
      .map((o) => ({
        source: o.source,
        externalId: o.externalId,
        problem: checkRaw(o.source, o.payload),
      }))
      .filter(
        (
          o,
        ): o is {
          source: typeof o.source;
          externalId: string;
          problem: string;
        } => o.problem !== null,
      );
  }

  private async unmapped(accountId: string) {
    return this.db
      .select({ sourceType: ledgerEntries.sourceType, count: count() })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.accountId, accountId),
          eq(ledgerEntries.kind, 'OTHER'),
        ),
      )
      .groupBy(ledgerEntries.sourceType);
  }

  private async save(
    accountId: string,
    reconciliation: Reconciliation,
  ): Promise<void> {
    await this.db
      .update(brokerAccounts)
      .set({ reconciliation })
      .where(eq(brokerAccounts.id, accountId));
  }
}
