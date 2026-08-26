import { Badge } from "@/components/ui/badge";
import { PnlText, PnlUsd } from "@/components/shared/pnl-text";

export const metadata = { title: "Portfolio" };

/**
 * Portfolio dashboard — Sprint 1 wires to /api/me + /api/positions.
 * Stats strip, equity curve placeholder, open positions table.
 */
export default function PortfolioPage() {
  return (
    <div className="h-full space-y-2 overflow-auto p-2">
      {/* stats strip */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="Total Value" value="$10,000.00" sub="cash + positions" />
        <StatCard label="Realized PnL" value="$0.00" sub="no closed trades yet" />
        <StatCard label="Unrealized PnL" value="$0.00" sub="mark-to-market" />
        <StatCard label="Win Rate" value="—" sub="needs 5+ closes" />
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
        {/* equity curve */}
        <div className="panel col-span-1 flex h-64 flex-col p-3 xl:col-span-2">
          <p className="label-caps mb-2">Equity Curve</p>
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line text-sm text-fg-muted">
            Chart lands with the first trade — flat at $10k for now
          </div>
        </div>

        {/* allocation */}
        <div className="panel flex h-64 flex-col p-3">
          <p className="label-caps mb-2">Allocation</p>
          <div className="num space-y-2.5 text-sm">
            <AllocRow label="Paper USDC" value="$10,000.00" pct={100} tone="green" />
          </div>
          <p className="mt-auto border-t border-line pt-2 text-xs leading-relaxed text-fg-muted">
            100% cash. Every degen starts somewhere.
          </p>
        </div>
      </div>

      {/* positions */}
      <div className="panel min-h-[200px] p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="label-caps">Open Positions</p>
          <Badge variant="outline">0</Badge>
        </div>
        <EmptyState />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="panel p-3">
      <p className="label-caps">{label}</p>
      <p className="num mt-1.5 text-xl font-semibold">{value}</p>
      <p className="mt-0.5 text-[11px] text-fg-muted">{sub}</p>
    </div>
  );
}

function AllocRow({
  label,
  value,
  pct,
}: {
  label: string;
  value: string;
  pct: number;
  tone?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-fg-dim">{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-4">
        <div
          className="h-full rounded-full bg-green/70"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-fg-dim">
        No open positions yet.
      </p>
      <p className="max-w-sm text-xs leading-relaxed text-fg-muted">
        Head to Discover, find something moving, and take your first paper
        trade. The engine simulates slippage, fees and failed transactions —
        exactly like the real thing.
      </p>
    </div>
  );
}
