import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Log in" };

/** Sprint 0 wires Supabase Auth here (email + Google OAuth). Shell for now. */
export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back, degen."
      subtitle="Your paper stack missed you."
    >
      <button disabled className={buttonVariants({ variant: "accent", size: "lg" })}>
        Continue with Google — coming with auth wiring
      </button>
      <div className="flex items-center gap-3 text-xs text-fg-muted">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <input
        disabled
        placeholder="you@example.com"
        className="num h-11 w-full rounded-md border border-line bg-surface-4 px-3 text-sm opacity-50"
      />
      <input
        disabled
        type="password"
        placeholder="Password"
        className="num h-11 w-full rounded-md border border-line bg-surface-4 px-3 text-sm opacity-50"
      />
      <button disabled className={buttonVariants({ variant: "buy", size: "lg" })}>
        Log in — coming with auth wiring
      </button>
    </AuthShell>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-6">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent font-bold text-white shadow-glow-accent">
          S
        </span>
        <span className="text-xl font-semibold tracking-tight">Svee</span>
      </Link>
      <div className="panel w-full max-w-sm space-y-4 p-6 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-fg-dim">{subtitle}</p>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
      <p className="text-xs text-fg-muted">
        Simulated trading only. No real funds, ever.
      </p>
    </div>
  );
}
