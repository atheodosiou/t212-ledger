import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, eq, inArray } from 'drizzle-orm';
import { toView } from '../accounts/accounts.service.js';
import type { Db } from '../db/db.js';
import {
  brokerAccounts,
  exportRows,
  ledgerEntries,
  rawEvents,
  sessions,
  taxProfiles,
  userIdentities,
  users,
} from '../db/schema.js';
import { SyncQueueService } from '../sync/sync-queue.service.js';
import { maskEmail } from './users.service.js';

/** GDPR: everything the service holds about a user, and erasing it. */
@Injectable()
export class UserDataService {
  private readonly logger = new Logger(UserDataService.name);

  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly sessionService: SessionService,
    private readonly queue: SyncQueueService,
  ) {}

  /**
   * Right of access / portability: one JSON document with every row about the user.
   * Trading 212 credentials are left out: they are the user's own secrets, encrypted,
   * and never leave the server.
   */
  async export(userId: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    const identities = await this.db
      .select({
        provider: userIdentities.provider,
        createdAt: userIdentities.createdAt,
      })
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId));
    const signedIn = await this.sessionService.list(userId);
    const accounts = await this.db
      .select()
      .from(brokerAccounts)
      .where(eq(brokerAccounts.userId, userId))
      .orderBy(asc(brokerAccounts.createdAt));

    const ids = accounts.map((a) => a.id);
    const raw = ids.length
      ? await this.db
          .select()
          .from(rawEvents)
          .where(inArray(rawEvents.accountId, ids))
          .orderBy(asc(rawEvents.occurredAt))
      : [];
    const ledger = ids.length
      ? await this.db
          .select()
          .from(ledgerEntries)
          .where(inArray(ledgerEntries.accountId, ids))
          .orderBy(asc(ledgerEntries.occurredAt))
      : [];
    const csvRows = ids.length
      ? await this.db
          .select()
          .from(exportRows)
          .where(inArray(exportRows.accountId, ids))
          .orderBy(asc(exportRows.occurredAt))
      : [];

    const [tax] = await this.db
      .select({
        profile: taxProfiles.profile,
        updatedAt: taxProfiles.updatedAt,
      })
      .from(taxProfiles)
      .where(eq(taxProfiles.userId, userId));

    return {
      exportedAt: new Date().toISOString(),
      user,
      signIn: { identities },
      /** Choices for the tax estimate: instrument classes, prior losses. */
      taxSettings: tax ?? null,
      sessions: signedIn.map((s) => ({
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        expiresAt: s.expiresAt,
        metadata: s.metadata ?? null,
      })),
      accounts: accounts.map((account) => ({
        ...toView(account),
        /** Exactly as Trading 212 returned them. */
        tradingHistory: raw
          .filter((r) => r.accountId === account.id)
          .map(({ accountId: _a, id: _i, ...r }) => r),
        /** Derived from tradingHistory; what the reports are built from. */
        ledger: ledger
          .filter((l) => l.accountId === account.id)
          .map(({ accountId: _a, id: _i, rawEventId: _r, ...l }) => l),
        /** Trading 212's own CSV export of the account, row by row. */
        tradingHistoryExport: csvRows
          .filter((r) => r.accountId === account.id)
          .map((r) => ({ occurredAt: r.occurredAt, row: r.payload })),
      })),
    };
  }

  /**
   * Right to erasure: the user, their accounts (credentials included), trading
   * history, ledger, identities and sessions. Daily database backups keep a copy for
   * up to 14 days, then it is gone everywhere.
   */
  async erase(userId: string): Promise<void> {
    const accounts = await this.db
      .select({ id: brokerAccounts.id })
      .from(brokerAccounts)
      .where(eq(brokerAccounts.userId, userId));
    for (const { id } of accounts) await this.queue.cancel(id);

    const [user] = await this.db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      // Cascades to identities, broker accounts, raw events and ledger entries.
      return tx
        .delete(users)
        .where(eq(users.id, userId))
        .returning({ email: users.email });
    });
    // Sessions created while the delete ran (none expected) sign no one in, since
    // their user is gone; this clears them too.
    await this.sessionService.revokeAll(userId);
    if (user) {
      this.logger.log(
        `User erased: ${maskEmail(user.email)}, ${accounts.length} account(s)`,
      );
    }
  }
}
