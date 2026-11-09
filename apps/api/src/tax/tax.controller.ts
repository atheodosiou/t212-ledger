import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { z } from 'zod';
import type { AppUser } from '../auth/auth.types.js';
import { TaxService } from './tax.service.js';

const TAX_CLASSES = [
  'SHARE',
  'SHARE_QUALIFYING',
  'UCITS',
  'FUND_NON_EU',
  'ETC',
] as const;

const overviewQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

const classesSchema = z.object({
  /** ISIN → class; null forgets the choice and goes back to the suggestion. */
  classes: z.record(
    z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/),
    z.enum(TAX_CLASSES).nullable(),
  ),
});

const settingsSchema = z.object({
  interest: z.enum(['INTEREST', 'EXEMPT']).optional(),
  priorLosses: z
    .array(
      z.object({
        year: z.number().int().min(2000).max(2100),
        amount: z
          .string()
          .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Ποσό σε ευρώ, π.χ. 1250.50'),
      }),
    )
    .max(20)
    .optional(),
});

@Controller('tax')
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get()
  overview(
    @CurrentUser() user: AppUser,
    @Query({ schema: overviewQuerySchema })
    query: z.infer<typeof overviewQuerySchema>,
  ) {
    return this.tax.overview(user.id, query.year ?? null);
  }

  @Get('instruments')
  instruments(@CurrentUser() user: AppUser) {
    return this.tax.instruments(user.id);
  }

  @Put('instruments')
  async setClasses(
    @CurrentUser() user: AppUser,
    @Body({ schema: classesSchema }) body: z.infer<typeof classesSchema>,
  ) {
    await this.tax.updateProfile(user.id, (p) => {
      const classes = { ...p.classes };
      for (const [isin, taxClass] of Object.entries(body.classes)) {
        if (taxClass) classes[isin] = taxClass;
        else delete classes[isin];
      }
      return { ...p, classes };
    });
    return this.tax.instruments(user.id);
  }

  @Get('settings')
  async settings(@CurrentUser() user: AppUser) {
    const { interest, priorLosses } = await this.tax.profile(user.id);
    return { interest, priorLosses };
  }

  @Put('settings')
  async setSettings(
    @CurrentUser() user: AppUser,
    @Body({ schema: settingsSchema }) body: z.infer<typeof settingsSchema>,
  ) {
    const { interest, priorLosses } = await this.tax.updateProfile(
      user.id,
      (p) => ({
        ...p,
        ...(body.interest ? { interest: body.interest } : {}),
        ...(body.priorLosses ? { priorLosses: body.priorLosses } : {}),
      }),
    );
    return { interest, priorLosses };
  }
}
