import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface Session {
  email: string;
  exp: number;
}

export const SESSION_COOKIE = 'cortex_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.CORTEX_AUTH_SECRET;
  if (!s) throw new Error('CORTEX_AUTH_SECRET is not set.');
  return s;
}

/** `<base64url(payload)>.<base64url(hmac)>` — HMAC-SHA256 signed with the auth secret. */
export function signSession(session: Session): string {
  const body = Buffer.from(JSON.stringify(session)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined): Session | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
    if (!session.exp || Date.now() > session.exp) return null;
    return session;
  } catch {
    return null;
  }
}
