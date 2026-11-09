import { Throttle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { z } from 'zod';
import { ExportService } from '../export/export.service.js';
import { PortfolioService } from '../portfolio/portfolio.service.js';
import {
  LEDGER_SORT_COLUMNS,
  LedgerService,
  SALE_SORTS,
  type LedgerSort,
} from '../ledger/ledger.service.js';
import { SyncQueueService } from '../sync/sync-queue.service.js';
import type { AppUser } from '../auth/auth.types.js';
import {
  accountIdSchema,
  createAccountSchema,
  syncRequestSchema,
  type CreateAccountDto,
  type SyncRequestDto,
} from './accounts.schemas.js';
import { AccountsService, toView } from './accounts.service.js';

const pageSchema = {
  dir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  q: z.string().trim().max(60).optional(),
};

const ledgerQuerySchema = z.object({
  ...pageSchema,
  sort: z
    .enum(Object.keys(LEDGER_SORT_COLUMNS) as [LedgerSort, ...LedgerSort[]])
    .default('date'),
  kind: z
    .enum([
      'BUY',
      'SELL',
      'DEPOSIT',
      'WITHDRAWAL',
      'DIVIDEND',
      'INTEREST',
      'FEE',
      'TRANSFER',
      'CORPORATE_ACTION',
      'OTHER',
    ])
    .optional(),
});

const salesQuerySchema = z.object({
  ...pageSchema,
  sort: z.enum(SALE_SORTS).default('date'),
  method: z.enum(['AVERAGE', 'FIFO']).default('AVERAGE'),
});

const reportQuerySchema = z.object({
  method: z.enum(['AVERAGE', 'FIFO']).default('AVERAGE'),
});

const exportQuerySchema = reportQuerySchema.extend({
  format: z.enum(['xlsx', 'pdf']),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly queue: SyncQueueService,
    private readonly exports: ExportService,
    private readonly portfolios: PortfolioService,
  ) {}

  @Get()
  list(@CurrentUser() user: AppUser) {
    return this.accounts.list(user.id);
  }

  // Each attempt validates the key against Trading 212.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async create(
    @CurrentUser() user: AppUser,
    @Body({ schema: createAccountSchema }) dto: CreateAccountDto,
  ) {
    const account = await this.accounts.create(user.id, dto);
    // The first sync walks the whole history anyway, and can resume if interrupted.
    const queued = await this.queue.enqueue(account.id, false);
    return { ...account, syncStatus: queued ? 'QUEUED' : account.syncStatus };
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AppUser,
    @Param('id', { schema: accountIdSchema }) id: string,
  ) {
    return toView(await this.accounts.get(user.id, id));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AppUser,
    @Param('id', { schema: accountIdSchema }) id: string,
  ) {
    await this.accounts.get(user.id, id);
    await this.queue.cancel(id);
    await this.accounts.remove(user.id, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/sync')
  @HttpCode(202)
  async sync(
    @CurrentUser() user: AppUser,
    @Param('id', { schema: accountIdSchema }) id: string,
    @Body({ schema: syncRequestSchema }) body: SyncRequestDto,
  ) {
    await this.accounts.get(user.id, id);
    const queued = await this.queue.enqueue(id, body.full);
    return { queued };
  }

  @Get(':id/ledger')
  async entries(
    @CurrentUser() user: AppUser,
    @Param('id', { schema: accountIdSchema }) id: string,
    @Query({ schema: ledgerQuerySchema })
    query: z.infer<typeof ledgerQuerySchema>,
  ) {
    await this.accounts.get(user.id, id);
    const { sort, dir, limit, offset, ...filter } = query;
    return this.ledger.page(id, filter, { sort, dir, limit, offset });
  }

  @Get(':id/sales')
  async sales(
    @CurrentUser() user: AppUser,
    @Param('id', { schema: accountIdSchema }) id: string,
    @Query({ schema: salesQuerySchema })
    query: z.infer<typeof salesQuerySchema>,
  ) {
    await this.accounts.get(user.id, id);
    const { sort, dir, limit, offset, method, ...filter } = query;
    return this.ledger.salesPage(id, method, filter, {
      sort,
      dir,
      limit,
      offset,
    });
  }

  /** Live value, total result and its breakdown, open positions. */
  // Live data from Trading 212 (cached briefly); the page refreshes it once a minute.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':id/portfolio')
  async portfolio(
    @CurrentUser() user: AppUser,
    @Param('id', { schema: accountIdSchema }) id: string,
  ) {
    const account = await this.accounts.get(user.id, id);
    return this.portfolios.view(account);
  }

  @Get(':id/timeline')
  async timeline(
    @CurrentUser() user: AppUser,
    @Param('id', { schema: accountIdSchema }) id: string,
    @Query({ schema: reportQuerySchema })
    query: z.infer<typeof reportQuerySchema>,
  ) {
    await this.accounts.get(user.id, id);
    return this.ledger.timeline(id, query.method);
  }

  @Get(':id/insights')
  async insights(
    @CurrentUser() user: AppUser,
    @Param('id', { schema: accountIdSchema }) id: string,
  ) {
    const account = await this.accounts.get(user.id, id);
    return this.ledger.insights(id, account.accountCurrency);
  }

  // PDF and Excel generation is the heaviest work the API does.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':id/export')
  async export(
    @CurrentUser() user: AppUser,
    @Param('id', { schema: accountIdSchema }) id: string,
    @Query({ schema: exportQuerySchema })
    query: z.infer<typeof exportQuerySchema>,
  ): Promise<StreamableFile> {
    const account = await this.accounts.get(user.id, id);
    const file = await this.exports.export(
      account,
      query.format,
      query.method,
      query.year ?? null,
    );
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
      length: file.buffer.length,
    });
  }

  @Get(':id/report')
  async report(
    @CurrentUser() user: AppUser,
    @Param('id', { schema: accountIdSchema }) id: string,
    @Query({ schema: reportQuerySchema })
    query: z.infer<typeof reportQuerySchema>,
  ) {
    const account = await this.accounts.get(user.id, id);
    return this.ledger.report(id, query.method, account.accountCurrency);
  }
}
