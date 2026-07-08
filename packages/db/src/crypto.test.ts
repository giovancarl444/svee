import { resetEnvCache } from '@cortex/config';
import { beforeAll, describe, expect, it } from 'vitest';
import { decryptString, encryptString, resetKeyCache } from './crypto';

beforeAll(() => {
  process.env.DATABASE_URL = 'postgres://test';
  process.env.CORTEX_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  resetEnvCache();
  resetKeyCache();
});

describe('column encryption (AES-256-GCM)', () => {
  it('round-trips arbitrary UTF-8 content', () => {
    const plain = 'Subject: pay the €1,200 invoice by Friday — ok? 日本語 🧠';
    const envelope = encryptString(plain);
    expect(envelope.startsWith('v1:')).toBe(true);
    expect(envelope).not.toContain(plain);
    expect(decryptString(envelope)).toBe(plain);
  });

  it('produces a fresh IV each time (no deterministic ciphertext)', () => {
    const a = encryptString('same');
    const b = encryptString('same');
    expect(a).not.toBe(b);
    expect(decryptString(a)).toBe('same');
    expect(decryptString(b)).toBe('same');
  });

  it('rejects tampered ciphertext (auth tag)', () => {
    const env = encryptString('trusted');
    const parts = env.split(':');
    // Flip a byte in the ciphertext segment.
    const ct = Buffer.from(parts[3]!, 'base64');
    ct[0] = ct[0]! ^ 0xff;
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${ct.toString('base64')}`;
    expect(() => decryptString(tampered)).toThrow();
  });

  it('rejects a malformed envelope', () => {
    expect(() => decryptString('not-an-envelope')).toThrow(/Malformed/);
  });
});
