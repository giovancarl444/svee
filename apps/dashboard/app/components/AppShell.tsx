import type { ReactNode } from 'react';
import { Nav } from './Nav';

/**
 * The app frame: wordmark header, an "unsecured" banner while auth is not
 * configured (Constraint §10 — never expose CORTEX unauthenticated), the page
 * content, and the fixed bottom nav. Mobile-first; capped width on desktop.
 *
 * We read `process.env` directly (not the validated config) so this never throws
 * at build time when the datastore env is absent.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const authConfigured = Boolean(process.env.CORTEX_AUTH_SECRET);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-baseline justify-between px-5 pt-6 pb-3">
        <span className="text-lg font-semibold tracking-tight">CORTEX</span>
        <span className="tab-index">personal brain</span>
      </header>

      {!authConfigured && (
        <p className="mx-5 mb-4 border border-signal/60 px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-signal">
          unsecured · set CORTEX_AUTH_SECRET before exposing beyond localhost
        </p>
      )}

      <main className="flex-1 px-5 pb-28">{children}</main>

      <Nav />
    </div>
  );
}
