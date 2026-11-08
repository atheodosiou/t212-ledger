import { z } from 'zod';

/** 32 bytes, base64-encoded. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" */
const aesKey = z
  .string()
  .refine(
    (v) => Buffer.from(v, 'base64').length === 32,
    'must be 32 bytes, base64-encoded',
  );

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().default(3000),
    /** Interface to listen on. Loopback by default; in production the API sits behind Nginx on the same machine. */
    HOST: z.string().default('127.0.0.1'),
    DATABASE_URL: z.string().min(1),
    /** Encrypts new Trading 212 credentials. */
    CREDENTIAL_ENCRYPTION_KEY: aesKey,
    /**
     * Previous keys, comma-separated, still accepted for decryption while a rotation
     * is under way (see README, "Rotating the encryption key").
     */
    CREDENTIAL_ENCRYPTION_KEYS_OLD: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
      )
      .pipe(z.array(aesKey)),
    /** The public address of the web app, e.g. https://ledger.example.com. The API is served under it at /api. */
    WEB_ORIGIN: z.url().default('http://localhost:4200'),
    /** Google OAuth client ("Web application"). Both or neither. */
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    /** Express "trust proxy": `loopback` behind Nginx on the same machine, so rate limits see the real client address. */
    TRUST_PROXY: z.string().optional(),
  })
  .refine((env) => !!env.GOOGLE_CLIENT_ID === !!env.GOOGLE_CLIENT_SECRET, {
    message: 'Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
    path: ['GOOGLE_CLIENT_SECRET'],
  })
  .refine((env) => env.NODE_ENV !== 'production' || !!env.GOOGLE_CLIENT_ID, {
    message:
      'Production needs Google sign-in: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
    path: ['GOOGLE_CLIENT_ID'],
  })
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' || env.WEB_ORIGIN.startsWith('https://'),
    {
      message: 'WEB_ORIGIN must be https:// in production',
      path: ['WEB_ORIGIN'],
    },
  );

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  // An empty line in an env file (`GOOGLE_CLIENT_ID=`) means "not set".
  const set = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== ''),
  );
  const parsed = envSchema.safeParse(set);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** The redirect URI to register with Google: the callback, reached through the web origin. */
export function oidcCallbackUrl(webOrigin: string): string {
  return `${webOrigin.replace(/\/$/, '')}/api/auth/oidc/:provider/callback`;
}
