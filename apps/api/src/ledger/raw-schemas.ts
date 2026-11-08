import { z } from 'zod';
import type { RawSource } from './normalize.js';

// The fields the normalizer reads, with the types it relies on. Extra fields are
// allowed: Trading 212 adding something must not break anything, but a field we
// use going missing or changing type must be caught, not turned into a wrong amount.

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'not a date');
const finite = z.number().finite();

const instrument = z.object({
  ticker: z.string().min(1),
  name: z.string(),
  isin: z.string(),
  currency: z.string().length(3),
});

const orderItem = z.object({
  order: z.object({
    id: z.union([z.number(), z.string()]),
    side: z.enum(['BUY', 'SELL']),
    ticker: z.string().min(1),
    createdAt: isoDate,
    instrument: instrument.optional(),
  }),
  fill: z
    .object({
      id: z.union([z.number(), z.string()]),
      quantity: finite,
      price: finite,
      type: z.string().min(1),
      filledAt: isoDate,
      walletImpact: z.object({
        currency: z.string().length(3),
        netValue: finite,
        fxRate: finite,
        realisedProfitLoss: finite.optional(),
        taxes: z.array(z.object({ quantity: finite })).optional(),
      }),
    })
    .nullable()
    .optional(),
});

const dividend = z.object({
  amount: finite,
  grossAmountPerShare: finite,
  paidOn: isoDate,
  quantity: finite,
  reference: z.string().min(1),
  ticker: z.string().min(1),
  type: z.string(),
});

const cashTransaction = z.object({
  amount: finite,
  currency: z.string().length(3),
  dateTime: isoDate,
  reference: z.string().min(1),
  type: z.string().min(1),
});

const SCHEMAS: Record<RawSource, z.ZodType> = {
  ORDER: orderItem,
  DIVIDEND: dividend,
  TRANSACTION: cashTransaction,
};

/** Returns null when the record has everything the normalizer needs, otherwise what is wrong. */
export function checkRaw(source: RawSource, payload: unknown): string | null {
  const result = SCHEMAS[source].safeParse(payload);
  if (result.success) return null;
  return result.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}
