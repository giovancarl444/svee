import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getEnv } from '@cortex/config';

/**
 * Column-level encryption for message bodies (Constraint §5: "assume the box
 * could be seized or lost"). AES-256-GCM (authenticated) with a per-value random
 * IV. The key lives in `CORTEX_ENCRYPTION_KEY` (env / secret store), never in the
 * DB — so a stolen disk alone does not yield plaintext bodies.
 *
 * Envelope (stored as a `text` column): `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>`.
 * base64 never contains ':', so splitting on ':' is unambiguous.
 */

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';
let keyCache: Buffer | null = null;

function key(): Buffer {
  if (keyCache) return keyCache;
  const b64 = getEnv().CORTEX_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      'CORTEX_ENCRYPTION_KEY is not set — cannot read or write encrypted message bodies. Generate one with `openssl rand -base64 32`.',
    );
  }
  const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) {
    throw new Error(`CORTEX_ENCRYPTION_KEY must decode to 32 bytes; got ${k.length}.`);
  }
  keyCache = k;
  return k;
}

export function encryptString(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptString(envelope: string): string {
  const parts = envelope.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed ciphertext envelope.');
  }
  const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}

/** For tests — reset the memoized key after mutating env. */
export function resetKeyCache(): void {
  keyCache = null;
}
