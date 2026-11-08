import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  StreamableFile,
} from '@nestjs/common';
import { CurrentUser, SignInService } from '@nestjs/authentication';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { AppUser } from '../auth/auth.types.js';
import { UserDataService } from './user-data.service.js';
import { normalizeEmail } from './users.service.js';

const eraseSchema = z.object({
  /** The user types their address, so a stray click can't delete everything. */
  confirmEmail: z.string().trim().max(320),
});

/** The signed-in user's own data. */
@Controller('me')
export class MeController {
  constructor(
    private readonly data: UserDataService,
    private readonly signIns: SignInService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('export')
  @Header('Cache-Control', 'no-store')
  async export(@CurrentUser() user: AppUser): Promise<StreamableFile> {
    const body = Buffer.from(
      JSON.stringify(await this.data.export(user.id), null, 2),
    );
    const day = new Date().toISOString().slice(0, 10);
    return new StreamableFile(body, {
      type: 'application/json',
      disposition: `attachment; filename="t212-ledger-data-${day}.json"`,
      length: body.length,
    });
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete()
  @HttpCode(204)
  async erase(
    @CurrentUser() user: AppUser,
    @Body({ schema: eraseSchema }) body: z.infer<typeof eraseSchema>,
  ): Promise<void> {
    if (normalizeEmail(body.confirmEmail) !== user.email) {
      throw new BadRequestException(
        'Type your email address exactly to confirm',
      );
    }
    // This browser's session and cookie first, while it still exists.
    await this.signIns.signOut();
    await this.data.erase(user.id);
  }
}
