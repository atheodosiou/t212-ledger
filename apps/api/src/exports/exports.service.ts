import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, eq, min } from 'drizzle-orm';
import { setTimeout as sleep } from 'node:timers/promises';
import { AccountsService } from '../accounts/accounts.service.js';
import type { Db } from '../db/db.js';
import {
  brokerAccounts,
  exportRows,
  rawEvents,
  type BrokerAccount,
  type ExportState,
} from '../db/schema.js';
import { DEFAULT_TAX_TIME_ZONE } from '../ledger/cost-basis.js';
import { LedgerService } from '../ledger/ledger.service.js';
import type { T212Client } from '../trading212/t212.client.js';
import {
  T212ApiError,
  T212RateLimitError,
  type T212ExportReport,
} from '../trading212/t212.types.js';
import { parseCsv } from './csv.js';
import {
  checkAgainstExport,
  exportRowKey,
  exportTime,
  type ExportRow,
} from './export-check.js';
import { coveredPeriod, plannedExports } from './plan.js';

/** The list of exports may be read once a minute. */
const POLL_MS = 65_000;
/** A report that is not ready by then is left for the next run. */
const MAX_WAIT_MS = 20 * 60_000;
const MAX_RATE_LIMIT_WAITS = 10;
const INSERT_CHUNK = 500;

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);
  /** How long to wait between looks at a report being built. Shortened in tests. */
  pollMs = POLL_MS;

  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Brings the account's copy of Trading 212's CSV export up to date (only the years
   * that need it, see plannedExports), then uses it: reclassifies what the API
   * mislabels and compares the whole history line by line.
   */
  async run(
    accountId: string,
    signal?: AbortSignal,
    now = new Date(),
  ): Promise<void> {
    const [account] = await this.db
      .select()
      .from(brokerAccounts)
      .where(eq(brokerAccounts.id, accountId));
    if (!account) return;
    const state: ExportState = { years: {}, ...account.exportState };

    if (account.environment === 'DEMO') {
      await this.save(accountId, {
        ...state,
        running: null,
        blocked: {
          reason: 'demo',
          message: 'Το Trading 212 δεν δίνει exports σε λογαριασμούς Practice.',
          at: now.toISOString(),
        },
      });
      return;
    }

    const firstActivity = await this.firstActivity(accountId);
    const plan = plannedExports(
      firstActivity,
      state,
      now,
      DEFAULT_TAX_TIME_ZONE,
    );
    const client = this.accounts.clientFor(account);
    try {
      for (const request of plan) {
        state.running = {
          year: request.year,
          reportId: null,
          since: new Date().toISOString(),
        };
        await this.save(accountId, state);
        const reportId = await this.withRateLimit(
          () => client.requestExport(request.from, request.to),
          signal,
        );
        state.running.reportId = reportId;
        await this.save(accountId, state);

        const report = await this.waitForReport(client, reportId, signal);
        const csv = await client.downloadExport(report.downloadLink!);
        const stored = await this.store(accountId, String(reportId), csv);
        state.years[String(request.year)] = {
          coveredTo: request.to.toISOString(),
          fetchedAt: now.toISOString(),
          rows: stored.rows,
        };
        this.logger.log(
          `Account ${accountId}: export ${request.year} has ${stored.rows} rows, ${stored.added} new`,
        );
      }
      state.running = null;
      state.blocked = null;
      await this.save(accountId, state);
    } catch (error) {
      state.running = null;
      const permission =
        error instanceof T212ApiError &&
        (error.status === 401 || error.status === 403);
      state.blocked = {
        reason: permission ? 'permission' : 'error',
        message: permission
          ? 'Το API key δεν επιτρέπει exports. Ενεργοποίησε το δικαίωμα ανάγνωσης του ιστορικού στο Trading 212.'
          : 'Το export του Trading 212 δεν ολοκληρώθηκε. Θα ξαναδοκιμάσει στον επόμενο συγχρονισμό.',
        at: new Date().toISOString(),
      };
      await this.save(accountId, state);
      this.logger.warn(
        `Account ${accountId}: export failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Whatever was fetched before the failure is still used below.
    }

    await this.ledger.applyExportClassifications(accountId);
    await this.check(account, state, firstActivity);
  }

  /** The stored export rows of an account, oldest first. */
  async rows(accountId: string): Promise<ExportRow[]> {
    const rows = await this.db
      .select()
      .from(exportRows)
      .where(eq(exportRows.accountId, accountId))
      .orderBy(asc(exportRows.occurredAt));
    return rows.map((r) => ({
      rowKey: r.rowKey,
      action: r.action,
      occurredAt: r.occurredAt,
      externalId: r.externalId,
      payload: r.payload,
    }));
  }

  /** Compares the API history with the export over the period the export covers. */
  private async check(
    account: BrokerAccount,
    state: ExportState,
    firstActivity: Date | null,
  ): Promise<void> {
    const period = coveredPeriod(firstActivity, state, DEFAULT_TAX_TIME_ZONE);
    if (!period) return;
    const api = await this.db
      .select({
        source: rawEvents.source,
        externalId: rawEvents.externalId,
        occurredAt: rawEvents.occurredAt,
        payload: rawEvents.payload,
      })
      .from(rawEvents)
      .where(eq(rawEvents.accountId, account.id));
    const rows = (await this.rows(account.id)).filter(
      (r) => r.occurredAt >= period.from && r.occurredAt <= period.to,
    );
    const result = checkAgainstExport(api, rows, period);
    await this.db
      .update(brokerAccounts)
      .set({ exportCheck: result })
      .where(eq(brokerAccounts.id, account.id));
    this.logger.log(
      `Account ${account.id}: export check ${result.ok ? 'matches' : `${result.differences.length + result.truncated} difference(s)`} ` +
        `(${result.compared.orders} orders, ${result.compared.dividends} dividends, ${result.compared.cash} cash)`,
    );
  }

  private async waitForReport(
    client: T212Client,
    reportId: number,
    signal?: AbortSignal,
  ): Promise<T212ExportReport> {
    const deadline = Date.now() + MAX_WAIT_MS;
    for (;;) {
      // Reports take a while to build; the first look is after the list's rate window anyway.
      await sleep(this.pollMs, undefined, { signal });
      const report = (
        await this.withRateLimit(() => client.exports(), signal)
      ).find((r) => r.reportId === reportId);
      if (report?.status === 'Finished' && report.downloadLink) return report;
      if (report?.status === 'Failed' || report?.status === 'Canceled') {
        throw new Error(`Trading 212 export ${reportId}: ${report.status}`);
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Trading 212 export ${reportId} not ready after 20 minutes`,
        );
      }
    }
  }

  /** Stores a CSV's rows; rows already stored (same ID, or same content) are kept as they are. */
  private async store(
    accountId: string,
    reportId: string,
    csv: string,
  ): Promise<{ rows: number; added: number }> {
    const parsed = parseCsv(csv);
    if (
      parsed.length &&
      !('Action' in parsed[0] && 'Time (UTC)' in parsed[0])
    ) {
      throw new Error(
        'The export does not look like a Trading 212 history CSV',
      );
    }
    const values = parsed.map((row) => ({
      accountId,
      rowKey: exportRowKey(row),
      action: row.Action,
      occurredAt: exportTime(row['Time (UTC)']),
      externalId: row.ID || null,
      payload: row,
      reportId,
    }));
    let added = 0;
    for (let i = 0; i < values.length; i += INSERT_CHUNK) {
      const inserted = await this.db
        .insert(exportRows)
        .values(values.slice(i, i + INSERT_CHUNK))
        .onConflictDoNothing({
          target: [exportRows.accountId, exportRows.rowKey],
        })
        .returning({ id: exportRows.id });
      added += inserted.length;
    }
    return { rows: values.length, added };
  }

  private async firstActivity(accountId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ first: min(rawEvents.occurredAt) })
      .from(rawEvents)
      .where(eq(rawEvents.accountId, accountId));
    return row?.first ?? null;
  }

  private async save(accountId: string, state: ExportState): Promise<void> {
    await this.db
      .update(brokerAccounts)
      .set({ exportState: { ...state } })
      .where(eq(brokerAccounts.id, accountId));
  }

  private async withRateLimit<T>(
    fn: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (
          !(error instanceof T212RateLimitError) ||
          attempt >= MAX_RATE_LIMIT_WAITS
        )
          throw error;
        await sleep(
          Math.max(1_000, error.resetAt.getTime() - Date.now() + 1_000),
          undefined,
          {
            signal,
          },
        );
      }
    }
  }
}
