import { z } from 'zod';

const LOOPBACK = ['127.0.0.1', '::1', 'localhost'];

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    /** Interface to listen on. Loopback only by default: nothing on the network can reach the API. */
    HOST: z.string().default('127.0.0.1'),
    DATABASE_URL: z.string().min(1),
    /** 32 bytes, base64-encoded. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" */
    CREDENTIAL_ENCRYPTION_KEY: z
      .string()
      .refine(
        (v) => Buffer.from(v, 'base64').length === 32,
        'must be 32 bytes, base64-encoded',
      ),
    /** Temporary single-user mode until real sign-in lands. */
    DEV_USER_EMAIL: z.email().optional(),
    WEB_ORIGIN: z.string().default('http://localhost:4200'),
  })
  .refine((env) => !env.DEV_USER_EMAIL || LOOPBACK.includes(env.HOST), {
    message:
      'HOST must be a loopback address while DEV_USER_EMAIL is set: without real sign-in anyone who can reach the API sees every account.',
    path: ['HOST'],
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
