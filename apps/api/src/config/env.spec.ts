import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://x',
  CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
};

describe('validateEnv', () => {
  it('listens on loopback by default', () => {
    expect(validateEnv(base).HOST).toBe('127.0.0.1');
  });

  it('refuses a network address with the development sign-in', () => {
    expect(() =>
      validateEnv({
        ...base,
        DEV_USER_EMAIL: 'dev@localhost.test',
        HOST: '0.0.0.0',
      }),
    ).toThrow(/HOST must be a loopback address/);
  });

  it('allows loopback with the development sign-in', () => {
    expect(
      validateEnv({
        ...base,
        DEV_USER_EMAIL: 'dev@localhost.test',
        HOST: '::1',
      }).HOST,
    ).toBe('::1');
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() =>
      validateEnv({ ...base, CREDENTIAL_ENCRYPTION_KEY: 'short' }),
    ).toThrow(/32 bytes/);
  });

  const production = {
    ...base,
    NODE_ENV: 'production',
    WEB_ORIGIN: 'https://ledger.example.com',
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
  };

  it('accepts a complete production setup', () => {
    expect(validateEnv(production).NODE_ENV).toBe('production');
  });

  it('refuses the development sign-in in production', () => {
    expect(() =>
      validateEnv({ ...production, DEV_USER_EMAIL: 'dev@localhost.test' }),
    ).toThrow(/not allowed in production/);
  });

  it('requires Google sign-in and https in production', () => {
    expect(() =>
      validateEnv({
        ...production,
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
      }),
    ).toThrow(/Production needs Google sign-in/);
    expect(() =>
      validateEnv({ ...production, WEB_ORIGIN: 'http://ledger.example.com' }),
    ).toThrow(/https/);
  });

  it('treats empty values from an env file as unset', () => {
    const env = validateEnv({
      ...base,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      DEV_USER_EMAIL: '',
      CREDENTIAL_ENCRYPTION_KEYS_OLD: '',
    });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.DEV_USER_EMAIL).toBeUndefined();
    expect(env.CREDENTIAL_ENCRYPTION_KEYS_OLD).toEqual([]);
  });

  it('needs both halves of the Google client', () => {
    expect(() => validateEnv({ ...base, GOOGLE_CLIENT_ID: 'id' })).toThrow(
      /both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/,
    );
  });

  it('parses previous encryption keys and checks each', () => {
    const old = Buffer.alloc(32, 1).toString('base64');
    expect(
      validateEnv({
        ...base,
        CREDENTIAL_ENCRYPTION_KEYS_OLD: ' ' + old + ' , ',
      }).CREDENTIAL_ENCRYPTION_KEYS_OLD,
    ).toEqual([old]);
    expect(() =>
      validateEnv({ ...base, CREDENTIAL_ENCRYPTION_KEYS_OLD: 'short' }),
    ).toThrow(/32 bytes/);
  });
});
