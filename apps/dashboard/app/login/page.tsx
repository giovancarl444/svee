import { loginAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-8">
        <span className="text-lg font-semibold tracking-tight">CORTEX</span>
        <p className="tab-index mt-1">operator access</p>
      </div>
      <form action={loginAction} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="email"
          autoComplete="username"
          required
          className="border border-ink/20 bg-transparent px-3 py-2 outline-none focus:border-ink"
        />
        <input
          name="password"
          type="password"
          placeholder="password"
          autoComplete="current-password"
          required
          className="border border-ink/20 bg-transparent px-3 py-2 outline-none focus:border-ink"
        />
        <button type="submit" className="mt-2 bg-ink px-3 py-2 font-medium text-bone">
          Enter
        </button>
      </form>
      {error ? <p className="mt-4 font-mono text-[11px] uppercase text-signal">invalid credentials</p> : null}
    </main>
  );
}
