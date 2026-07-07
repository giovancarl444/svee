import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { authConfigured, getSession } from '@/lib/auth';
import { AppShell } from '@/app/components/AppShell';

/**
 * The gate for every real view (Constraint §10). Runs on the Node server with
 * live env (so runtime-injected secrets work), unlike an Edge middleware. When
 * auth is configured, an unauthenticated request is redirected to /login, which
 * lives OUTSIDE this route group and is therefore reachable.
 */
export default async function SecureLayout({ children }: { children: ReactNode }) {
  if (authConfigured()) {
    const session = await getSession();
    if (!session) redirect('/login');
  }
  return <AppShell>{children}</AppShell>;
}
