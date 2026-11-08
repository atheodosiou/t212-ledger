import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq } from 'drizzle-orm';
import { EncryptionService } from '../crypto/encryption.service.js';
import type { Db } from '../db/db.js';
import { brokerAccounts, type BrokerAccount } from '../db/schema.js';
import { T212Client } from '../trading212/t212.client.js';
import { T212ApiError } from '../trading212/t212.types.js';
import type { CreateAccountDto } from './accounts.schemas.js';

/** What the API exposes about an account. Credentials never leave the server. */
export type AccountView = Omit<BrokerAccount, 'apiKeyEnc' | 'apiSecretEnc'>;

export function toView({
  apiKeyEnc: _k,
  apiSecretEnc: _s,
  ...rest
}: BrokerAccount): AccountView {
  return rest;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly encryption: EncryptionService,
  ) {}

  async create(userId: string, dto: CreateAccountDto): Promise<AccountView> {
    // Validate the key before storing it.
    try {
      await new T212Client(dto).accountSummary();
    } catch (error) {
      if (
        error instanceof T212ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw new BadRequestException(
          'Trading 212 rejected this API key. Check the key, the secret and that you picked the right environment (Practice/Live).',
        );
      }
      throw error;
    }

    const [row] = await this.db
      .insert(brokerAccounts)
      .values({
        userId,
        label: dto.label,
        environment: dto.environment,
        apiKeyEnc: this.encryption.encrypt(dto.apiKey),
        apiSecretEnc: this.encryption.encrypt(dto.apiSecret),
      })
      .returning();
    return toView(row);
  }

  async list(userId: string): Promise<AccountView[]> {
    const rows = await this.db
      .select()
      .from(brokerAccounts)
      .where(eq(brokerAccounts.userId, userId))
      .orderBy(desc(brokerAccounts.createdAt));
    return rows.map(toView);
  }

  /** Loads an account and enforces ownership. */
  async get(userId: string, accountId: string): Promise<BrokerAccount> {
    const [row] = await this.db
      .select()
      .from(brokerAccounts)
      .where(
        and(
          eq(brokerAccounts.id, accountId),
          eq(brokerAccounts.userId, userId),
        ),
      );
    if (!row) throw new NotFoundException('Account not found');
    return row;
  }

  async remove(userId: string, accountId: string): Promise<void> {
    await this.get(userId, accountId);
    // Raw events and ledger entries are removed by ON DELETE CASCADE.
    await this.db
      .delete(brokerAccounts)
      .where(eq(brokerAccounts.id, accountId));
  }

  clientFor(account: BrokerAccount): T212Client {
    return new T212Client({
      apiKey: this.encryption.decrypt(account.apiKeyEnc),
      apiSecret: this.encryption.decrypt(account.apiSecretEnc),
      environment: account.environment,
    });
  }
}
