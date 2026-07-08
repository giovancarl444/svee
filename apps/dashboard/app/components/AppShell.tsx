import type { ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { Nav } from './Nav';

/**
 * The app frame: wordmark header, a sign-out control, the page content, and the
 * fixed bottom nav. Mobile-first; capped width on desktop.
 *
 * Only ever rendered once operator auth is configured AND a session is valid (the
 * secure layout fails closed otherwise — Constraint §10), so there is no
 * "unsecured" state to signal here.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-baseline justify-between px-5 pt-6 pb-3">
        <span className="text-lg font-semibold tracking-tight">CORTEX</span>
        <form action={logoutAction}>
          <button type="submit" className="tab-index hover:text-ink">
            sign out
          </button>
        </form>
      </header>

      <main className="flex-1 px-5 pb-28">{children}</main>

      <Nav />
    </div>
  );
}
