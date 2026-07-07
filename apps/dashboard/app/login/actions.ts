'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyPassword } from '@/lib/password';
import { SESSION_COOKIE, SESSION_TTL_MS, signSession } from '@/lib/session';

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const operatorEmail = (process.env.CORTEX_OPERATOR_EMAIL ?? '').trim().toLowerCase();
  const hash = process.env.CORTEX_OPERATOR_PASSWORD_HASH ?? '';

  if (!operatorEmail || !hash || email !== operatorEmail || !verifyPassword(password, hash)) {
    redirect('/login?error=1');
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, signSession({ email, exp: Date.now() + SESSION_TTL_MS }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
