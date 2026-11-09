import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { z } from 'zod';
import type { AppUser } from '../auth/auth.types.js';
import { YearService } from './year.service.js';

const yearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

@Controller('year')
export class YearController {
  constructor(private readonly years: YearService) {}

  /** "Your year": one year of investing, over the user's live accounts. */
  @Get()
  overview(
    @CurrentUser() user: AppUser,
    @Query({ schema: yearQuerySchema }) query: z.infer<typeof yearQuerySchema>,
  ) {
    return this.years.overview(user.id, query.year ?? null);
  }
}
