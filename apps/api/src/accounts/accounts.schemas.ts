import { z } from 'zod';

export const createAccountSchema = z.object({
  label: z.string().trim().min(1).max(60),
  environment: z.enum(['DEMO', 'LIVE']),
  apiKey: z.string().trim().min(10).max(200),
  apiSecret: z.string().trim().min(10).max(200),
});
export type CreateAccountDto = z.infer<typeof createAccountSchema>;

export const accountIdSchema = z.uuid();

export const syncRequestSchema = z
  .object({ full: z.boolean().default(false) })
  .default({ full: false });
export type SyncRequestDto = z.infer<typeof syncRequestSchema>;
