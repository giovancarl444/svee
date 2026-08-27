"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { fmtUsd, fmtPct, timeAgo } from "@/lib/format";

interface Trade {
  mint: string;
  symbol: string;
  entryUsd: number;
  targetUsd: number;
  stopUsd: number;
  exitUsd: number;
  exitMult: number;
  outcome: "OPEN" | "WIN" | "STOP" | "EXPIRED";
  enteredAt: number;
  exitedAt: number | null;
  pnlPct: number;
}
interface Caller {
  handle: string;
  calls: number;
  wins: number;
  winRate: number;
  best: number;
  avgMultiple: number;
}
interface Callout {
  mint: string;
  symbol: string;
  source: string;
  sourceHandle?: string;
  calledMcUsd: number;
  multiple?: number;
  reasons: string[];
  calledAt: number;
}

export default function DashboardPage() {
  const { data: trades } = useQuery({
    queryKey: ["trades"],
    queryFn: () => api<{ trades: Trade[]; summary: { open: number; wins: number; stops: number; total: number } }>("/api/trades"),
    refetchInterval: 5000,
  });
  const { data: callers } = useQuery({
    queryKey: ["callers"],
    queryFn: () => api<{ leaders: Caller[] }>("/api/callers"),
    refetchInterval: 15000,
  });
  const { data: callouts } = useQuery({
    queryKey: ["callouts-dash"],
    queryFn: () => api<{ callouts: Callout[]; trackRecord: unknown }>("/api/callouts"),
    refetchInterval: 15000,
  });

  const t = trades?.summary;
  const open = trades?.trades?.filter((x: Trade) => x.outcome === "OPEN") ?? [];

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3">
      {/* Header stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Paper Trades" value={String(t?.total ?? 0)} />
        <Stat label="Open" value={String(t?.open ?? 0)} accent />
        <Stat label="Wins (2x)" value={String(t?.wins ?? 0)} accent={t && t.wins > 0} />
        <Stat label="Stops" value={String(t?.stops ?? 0)} />
        <Stat label="Callers" value={String(callers?.leaders?.length ?? 0)} />
        <Stat label="Calls" value={String(callouts?.callouts?.length ?? 0)} />
      </div>

      <p className="num text-xs text-fg-muted">
        Live MEGAPHONE dashboard — trades auto-resolve every 60s, caller sheet
        tracks every caller&apos;s hit-rate. Scalp target: <span className="text-accent">+100%</span>,
        stop: <span className="text-danger">-30%</span>.
      </p>

      {/* Two columns: trades (left) + callers (right) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Trades table */}
        <div className="panel flex min-h-0 flex-col lg:col-span-2">
          <div className="border-b border-line px-3 py-2 text-sm font-medium">
            Paper Trades ({open.length} open)
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Stop</th>
                  <th className="px-3 py-2">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {(trades?.trades ?? []).slice(0, 40).map((x: Trade) => (
                  <tr key={x.mint} className="border-b border-line/50">
                    <td className="px-3 py-2 font-medium">${x.symbol}</td>
                    <td className="px-3 py-2">{fmtUsd(x.entryUsd)}</td>
                    <td className="px-3 py-2 text-accent">{fmtUsd(x.targetUsd)}</td>
                    <td className="px-3 py-2 text-danger">{fmtUsd(x.stopUsd)}</td>
                    <td className="px-3 py-2">
                      <OutcomeBadge o={x.outcome} />
                    </td>
                  </tr>
                ))}
                {(trades?.trades?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-fg-muted">
                      No paper trades yet. They open when a call is broadcast.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Caller leaderboard */}
        <div className="panel flex min-h-0 flex-col">
          <div className="border-b border-line px-3 py-2 text-sm font-medium">
            Caller Leaderboard
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2">Caller</th>
                  <th className="px-3 py-2">Calls</th>
                  <th className="px-3 py-2">Best</th>
                </tr>
              </thead>
              <tbody>
                {(callers?.leaders ?? []).slice(0, 30).map((c: Caller) => (
                  <tr key={c.handle} className="border-b border-line/50">
                    <td className="px-3 py-2 font-medium">{c.handle}</td>
                    <td className="px-3 py-2">{c.calls}</td>
                    <td className="px-3 py-2 text-accent">{c.best.toFixed(1)}x</td>
                  </tr>
                ))}
                {(callers?.leaders?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-fg-muted">
                      No callers tracked yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Live call feed */}
      <div className="panel min-h-0 flex-1 overflow-auto">
        <div className="border-b border-line px-3 py-2 text-sm font-medium">
          Live Call Feed
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          {(callouts?.callouts ?? []).slice(0, 24).map((c: Callout) => (
            <span
              key={c.mint}
              className="rounded border border-line px-2 py-1 text-xs"
              title={c.reasons?.join(" ")}
            >
              <span className="font-medium">${c.symbol}</span>{" "}
              {c.multiple ? (
                <span className="text-accent">{c.multiple.toFixed(1)}x</span>
              ) : (
                <span className="text-fg-muted">{fmtUsd(c.calledMcUsd)}</span>
              )}{" "}
              <span className="text-fg-muted">{c.sourceHandle ?? c.source}</span>
            </span>
          ))}
          {(callouts?.callouts?.length ?? 0) === 0 && (
            <span className="text-sm text-fg-muted">No calls yet.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel p-3">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ? "text-accent" : ""}`}>{value}</div>
    </div>
  );
}

function OutcomeBadge({ o }: { o: string }) {
  const cls =
    o === "WIN"
      ? "text-accent"
      : o === "STOP"
        ? "text-danger"
        : o === "OPEN"
          ? "text-fg-muted"
          : "text-fg-muted";
  return <span className={cls}>{o}</span>;
}
