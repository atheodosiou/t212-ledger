import { Injectable } from '@nestjs/common';
import type { BrokerAccount } from '../db/schema.js';
import type { CostMethod } from '../ledger/cost-basis.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { TaxService } from '../tax/tax.service.js';
import { buildPdf } from './pdf.js';
import { buildReportData } from './report-data.js';
import { buildXlsx } from './xlsx.js';

export type ExportFormat = 'xlsx' | 'pdf';

export interface ExportFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

@Injectable()
export class ExportService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly tax: TaxService,
  ) {}

  async export(
    account: BrokerAccount,
    format: ExportFormat,
    method: CostMethod,
    year: number | null,
  ): Promise<ExportFile> {
    const entries = await this.ledger.list(account.id);
    const data = buildReportData(entries, {
      accountLabel: account.label,
      environment: account.environment,
      currency: account.accountCurrency,
      method,
      year,
      generatedAt: new Date(),
      dividendExportRows: await this.ledger.dividendExportRows(account.id),
    });
    // The tax estimate is per person, over every live account in EUR; only for one year.
    const tax =
      format === 'xlsx' &&
      year !== null &&
      account.environment === 'LIVE' &&
      account.accountCurrency === 'EUR'
        ? await this.tax.overview(account.userId, year)
        : null;
    const buffer =
      format === 'xlsx' ? await buildXlsx(data, tax) : await buildPdf(data);
    const slug =
      account.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'account';
    return {
      buffer,
      contentType: CONTENT_TYPES[format],
      filename: `trading212-${slug}-${year ?? 'all'}-${method.toLowerCase()}.${format}`,
    };
  }
}
