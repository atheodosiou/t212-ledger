import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://x',
  CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
};

describe('validateEnv', () => {
  it('listens on loopback by default', () => {
    expect(validateEnv(base).HOST).toBe('127.0.0.1');
  });

  it('refuses a network address while sign-in is the dev stub', () => {
    expect(() =>
      validateEnv({
        ...base,
        DEV_USER_EMAIL: 'dev@localhost.test',
        HOST: '0.0.0.0',
      }),
    ).toThrow(/HOST must be a loopback address/);
  });

  it('allows loopback with the dev stub', () => {
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
});
