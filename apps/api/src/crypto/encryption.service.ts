import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import type { Env } from '../config/env.js';

/** Short, non-secret fingerprint of a key, stored with each ciphertext. */
export function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('base64url').slice(0, 8);
}

/**
 * AES-256-GCM with key rotation.
 *
 * Format: `v2.<keyId>.<iv>.<tag>.<ciphertext>` (base64url parts). New values are
 * always encrypted with the current key; values under a previous key (or the older
 * `v1.<iv>.<tag>.<ciphertext>` format, which carries no key id) still decrypt while
 * that key is listed as old, until `npm run credentials:rotate` re-encrypts them.
 */
export class Keyring {
  private readonly current: { id: string; key: Buffer };
  private readonly byId = new Map<string, Buffer>();

  constructor(current: string, old: string[] = []) {
    const key = Buffer.from(current, 'base64');
    this.current = { id: keyId(key), key };
    for (const k of [key, ...old.map((o) => Buffer.from(o, 'base64'))]) {
      this.byId.set(keyId(k), k);
    }
  }

  get currentKeyId(): string {
    return this.current.id;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.current.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [
      'v2',
      this.current.id,
      ...[iv, cipher.getAuthTag(), data].map((p) => p.toString('base64url')),
    ].join('.');
  }

  decrypt(payload: string): string {
    const parts = payload.split('.');
    if (parts[0] === 'v2' && parts.length === 5) {
      const key = this.byId.get(parts[1]);
      if (!key) {
        throw new Error(
          `Encrypted with key ${parts[1]}, which is not configured (CREDENTIAL_ENCRYPTION_KEY / CREDENTIAL_ENCRYPTION_KEYS_OLD)`,
        );
      }
      return open(key, parts[2], parts[3], parts[4]);
    }
    if (parts[0] === 'v1' && parts.length === 4) {
      // No key id: the GCM tag tells which key it was.
      for (const key of this.byId.values()) {
        try {
          return open(key, parts[1], parts[2], parts[3]);
        } catch {
          // try the next key
        }
      }
      throw new Error('No configured key decrypts this value');
    }
    throw new Error('Unsupported ciphertext format');
  }

  /** True when the value is not yet under the current key. */
  needsRotation(payload: string): boolean {
    const [version, id] = payload.split('.');
    return version !== 'v2' || id !== this.current.id;
  }
}

function open(key: Buffer, iv: string, tag: string, data: string): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

@Injectable()
export class EncryptionService extends Keyring {
  constructor(config: ConfigService<Env, true>) {
    super(
      config.get('CREDENTIAL_ENCRYPTION_KEY', { infer: true }),
      config.get('CREDENTIAL_ENCRYPTION_KEYS_OLD', { infer: true }),
    );
  }
}
