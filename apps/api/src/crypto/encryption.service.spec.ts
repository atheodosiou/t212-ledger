import { createCipheriv, randomBytes } from 'node:crypto';
import { Keyring } from './encryption.service.js';

const newKey = () => randomBytes(32).toString('base64');

/** A value in the format used before key ids existed. */
function legacyV1(key: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

describe('Keyring', () => {
  it('round-trips and tags values with the current key', () => {
    const ring = new Keyring(newKey());
    const enc = ring.encrypt('secret');
    expect(enc.startsWith(`v2.${ring.currentKeyId}.`)).toBe(true);
    expect(ring.decrypt(enc)).toBe('secret');
    expect(ring.needsRotation(enc)).toBe(false);
  });

  it('decrypts values under an old key while it is listed, and flags them for rotation', () => {
    const a = newKey();
    const b = newKey();
    const before = new Keyring(a).encrypt('secret');
    const rotating = new Keyring(b, [a]);
    expect(rotating.decrypt(before)).toBe('secret');
    expect(rotating.needsRotation(before)).toBe(true);
    const after = rotating.encrypt(rotating.decrypt(before));
    expect(new Keyring(b).decrypt(after)).toBe('secret');
  });

  it('refuses a value whose key is no longer configured', () => {
    const before = new Keyring(newKey()).encrypt('secret');
    expect(() => new Keyring(newKey()).decrypt(before)).toThrow(
      /not configured/,
    );
  });

  it('reads the older v1 format under either key', () => {
    const a = newKey();
    const b = newKey();
    expect(new Keyring(a).decrypt(legacyV1(a, 'x'))).toBe('x');
    expect(new Keyring(b, [a]).decrypt(legacyV1(a, 'x'))).toBe('x');
    expect(new Keyring(b, [a]).needsRotation(legacyV1(a, 'x'))).toBe(true);
    expect(() => new Keyring(b).decrypt(legacyV1(a, 'x'))).toThrow();
  });

  it('detects tampering', () => {
    const ring = new Keyring(newKey());
    const parts = ring.encrypt('secret').split('.');
    parts[4] = Buffer.from('tampered').toString('base64url');
    expect(() => ring.decrypt(parts.join('.'))).toThrow();
  });
});
