import 'server-only';
import { scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Verify a password against a stored `scrypt$<salt-b64>$<hash-b64>` string
 * (produced by `pnpm hash-password`). We never store the plaintext (Constraint §10).
 */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
