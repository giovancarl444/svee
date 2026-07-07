import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession, type Session } from './session';

/** Auth is enforced only once both the secret and the operator hash are set. */
export function authConfigured(): boolean {
  return Boolean(process.env.CORTEX_AUTH_SECRET && process.env.CORTEX_OPERATOR_PASSWORD_HASH);
}

export async function getSession(): Promise<Session | null> {
  if (!authConfigured()) return null;
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}
