import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Sign up" };

/** Sprint 0 wires Supabase Auth + profile/portfolio trigger here. */
export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-6">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent font-bold text-white shadow-glow-accent">
          S
        </span>
        <span className="text-xl font-semibold tracking-tight">Svee</span>
      </Link>
      <div className="panel w-full max-w-sm space-y-4 p-6 text-center">
        <span className="label-caps inline-block rounded-full border border-green/25 bg-green-dim px-3 py-1 text-green">
          $10,000 PAPER USDC INCLUDED
        </span>
        <h1 className="text-xl font-semibold">Claim your practice stack</h1>
        <p className="text-sm leading-relaxed text-fg-dim">
          Real markets. Fake money. Zero excuses. Signup takes 30 seconds once
          auth is wired.
        </p>
        <button disabled className={buttonVariants({ variant: "buy", size: "lg" })}>
          Create account — coming with auth wiring
        </button>
      </div>
      <p className="max-w-xs text-center text-xs leading-relaxed text-fg-muted">
        By signing up you agree that nothing here is financial advice and none
        of it is real money.
      </p>
    </div>
  );
}
