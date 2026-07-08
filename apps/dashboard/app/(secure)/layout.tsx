import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { authConfigured, getSession } from '@/lib/auth';
import { AppShell } from '@/app/components/AppShell';

/**
 * The gate for every real view (Constraint §10). Runs on the Node server with
 * live env (so runtime-injected secrets work), unlike an Edge middleware.
 *
 * Fails CLOSED: if operator auth is not configured, NO data renders — not even in
 * a "setup mode". Operator credentials are provisioned out-of-band (`.env` + the
 * `hash-password` CLI), so the dashboard never needs to be reachable while
 * unconfigured; an unconfigured deploy therefore exposes nothing. When auth IS
 * configured, an unauthenticated request is redirected to /login (which lives
 * OUTSIDE this route group and is therefore reachable).
 */
export default async function SecureLayout({ children }: { children: ReactNode }) {
  if (!authConfigured()) return <SetupRequired />;
  const session = await getSession();
  if (!session) redirect('/login');
  return <AppShell>{children}</AppShell>;
}

/** Shown instead of any data when operator auth has not been configured. */
function SetupRequired() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div>
        <span className="text-lg font-semibold tracking-tight">CORTEX</span>
        <p className="tab-index mt-1">access closed · not configured</p>
      </div>
      <p className="mt-6 text-sm text-steel">
        CORTEX serves no data until operator auth is configured. Set these in your
        <span className="font-mono"> .env </span>
        and restart:
      </p>
      <ul className="mt-3 flex flex-col gap-1 font-mono text-[12px] text-ink">
        <li>CORTEX_AUTH_SECRET</li>
        <li>CORTEX_OPERATOR_EMAIL</li>
        <li>CORTEX_OPERATOR_PASSWORD_HASH</li>
      </ul>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-wide text-signal">
        hash it with: pnpm --filter @cortex/workers hash-password
      </p>
    </main>
  );
}
