import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ExportService } from '../export/export.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { SyncQueueService } from '../sync/sync-queue.service.js';
import { CurrentUser, DevUserGuard, type CurrentUserData } from '../users/current-user.js';
import {
  accountIdSchema,
  createAccountSchema,
  syncRequestSchema,
  type CreateAccountDto,
  type SyncRequestDto,
} from './accounts.schemas.js';
import { AccountsService, toView } from './accounts.service.js';

const ledgerQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  ticker: z.string().max(40).optional(),
  kind: z
    .enum(['BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'INTEREST', 'FEE', 'TRANSFER', 'CORPORATE_ACTION', 'OTHER'])
    .optional(),
});

const reportQuerySchema = z.object({ method: z.enum(['AVERAGE', 'FIFO']).default('AVERAGE') });

const exportQuerySchema = reportQuerySchema.extend({
  format: z.enum(['xlsx', 'pdf']),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

@Controller('accounts')
@UseGuards(DevUserGuard)
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly queue: SyncQueueService,
    private readonly exports: ExportService,
  ) {}

  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.accounts.list(user.id);
  }

  @Post()
  async create(@CurrentUser() user: CurrentUserData, @Body({ schema: createAccountSchema }) dto: CreateAccountDto) {
    const account = await this.accounts.create(user.id, dto);
    const queued = await this.queue.enqueue(account.id, true);
    return { ...account, syncStatus: queued ? 'QUEUED' : account.syncStatus };
  }

  @Get(':id')
  async get(@CurrentUser() user: CurrentUserData, @Param('id', { schema: accountIdSchema }) id: string) {
    return toView(await this.accounts.get(user.id, id));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: CurrentUserData, @Param('id', { schema: accountIdSchema }) id: string) {
    return this.accounts.remove(user.id, id);
  }

  @Post(':id/sync')
  @HttpCode(202)
  async sync(
    @CurrentUser() user: CurrentUserData,
    @Param('id', { schema: accountIdSchema }) id: string,
    @Body({ schema: syncRequestSchema }) body: SyncRequestDto,
  ) {
    await this.accounts.get(user.id, id);
    const queued = await this.queue.enqueue(id, body.full);
    return { queued };
  }

  @Get(':id/ledger')
  async entries(
    @CurrentUser() user: CurrentUserData,
    @Param('id', { schema: accountIdSchema }) id: string,
    @Query({ schema: ledgerQuerySchema }) query: z.infer<typeof ledgerQuerySchema>,
  ) {
    await this.accounts.get(user.id, id);
    return this.ledger.list(id, query);
  }

  @Get(':id/export')
  async export(
    @CurrentUser() user: CurrentUserData,
    @Param('id', { schema: accountIdSchema }) id: string,
    @Query({ schema: exportQuerySchema }) query: z.infer<typeof exportQuerySchema>,
  ): Promise<StreamableFile> {
    const account = await this.accounts.get(user.id, id);
    const file = await this.exports.export(account, query.format, query.method, query.year ?? null);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
      length: file.buffer.length,
    });
  }

  @Get(':id/report')
  async report(
    @CurrentUser() user: CurrentUserData,
    @Param('id', { schema: accountIdSchema }) id: string,
    @Query({ schema: reportQuerySchema }) query: z.infer<typeof reportQuerySchema>,
  ) {
    await this.accounts.get(user.id, id);
    return this.ledger.report(id, query.method);
  }
}
