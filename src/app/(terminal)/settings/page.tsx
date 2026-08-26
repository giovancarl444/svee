import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Settings" };

/** Sprint 0 scope: preferences shell. Supabase Auth wiring lands with the auth task. */
export default function SettingsPage() {
  return (
    <div className="mx-auto h-full max-w-2xl space-y-2 overflow-auto p-2">
      <section className="panel p-4">
        <p className="label-caps mb-3">Account</p>
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-surface-4 font-semibold text-fg-dim">
            E
          </span>
          <div>
            <p className="text-sm font-medium">ellio</p>
            <p className="text-xs text-fg-muted">Local development build · auth not yet connected</p>
          </div>
          <Badge variant="outline" className="ml-auto">PHASE 1</Badge>
        </div>
      </section>

      <section className="panel p-4">
        <p className="label-caps mb-3">Trading Defaults</p>
        <div className="space-y-3 text-sm">
          <Row label="Default slippage tolerance" value="Auto (engine-simulated)" />
          <Row label="Default order expiry" value="7 days" />
          <Row label="Quick buy presets" value="$100 · $500 · Snipe $1k" />
          <Row label="One-tap sizing" value="25 / 50 / 75 / Max" />
        </div>
      </section>

      <section className="panel p-4">
        <p className="label-caps mb-3">Danger Zone</p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Reset paper account</p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
              Flatten all positions at market and restore $10,000 USDC. Stats history is kept.
            </p>
          </div>
          <button
            disabled
            className="shrink-0 rounded-md border border-red/30 bg-red-dim px-3 py-2 text-sm font-medium text-red opacity-40"
            title="Available after the trading engine is wired"
          >
            Reset
          </button>
        </div>
      </section>

      <section className="panel p-4">
        <p className="label-caps mb-3">Simulation Transparency</p>
        <p className="text-xs leading-relaxed text-fg-muted">
          Every fill on Svee is simulated: slippage grows with trade size vs pool
          liquidity, platform fee 0.9%, sampled network fees, ~1.5% random
          transaction failure (6% on pairs under 24h old), and occasional MEV
          events on new launches. If a fill looks unfair — that&apos;s the point.
          Learn it here, survive it live.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2.5">
      <span className="text-fg-dim">{label}</span>
      <span className="num text-fg">{value}</span>
    </div>
  );
}
