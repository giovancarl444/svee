"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { fmtUsd } from "@/lib/format";

interface Trade {
  sig: string;
  mint: string;
  sizeUsd: number;
  hisMc: number;
  ourMc: number;
  entryDragPct: number;
  targetMc: number;
  stopMc: number;
  outcome: "OPEN" | "WIN" | "STOP";
  liveMc?: number;
  livePnlPct?: number;
  openedAt: number;
}

export default function CupseyPage() {
  const { data } = useQuery({
    queryKey: ["cupsey-trades"],
    queryFn: () => api<{ trades: Trade[]; summary: { total: number; open: number; wins: number; stops: number } }>("/api/cupsey-trades"),
    refetchInterval: 5000,
  });

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Trades" value={String(data?.summary?.total ?? 0)} />
        <Stat label="Open" value={String(data?.summary?.open ?? 0)} accent />
        <Stat label="Wins +100%" value={String(data?.summary?.wins ?? 0)} accent={(data?.summary?.wins ?? 0) > 0} />
        <Stat label="Stops -30%" value={String(data?.summary?.stops ?? 0)} />
      </div>

      <p className="num text-xs text-fg-muted">
        Cupsey copy-paper sim — we enter on his buy, exit at +100% on OUR entry. Drag = mc
        gap between his fill and ours.
      </p>

      <div className="panel flex min-h-0 flex-1 flex-col">
        <div className="border-b border-line px-3 py-2 text-sm font-medium">Live Trades</div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs text-fg-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-2">Token</th>
                <th className="px-3 py-2">His MC</th>
                <th className="px-3 py-2">Our MC</th>
                <th className="px-3 py-2">Drag</th>
                <th className="px-3 py-2">Live MC</th>
                <th className="px-3 py-2">Live PnL</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.trades ?? []).map((t: Trade) => (
                <tr key={t.sig} className="border-b border-line/50">
                  <td className="px-3 py-2 font-medium">{t.mint.slice(0, 6)}…{t.mint.slice(-4)}</td>
                  <td className="px-3 py-2">{fmtUsd(t.hisMc)}</td>
                  <td className="px-3 py-2">{fmtUsd(t.ourMc)}</td>
                  <td className="px-3 py-2 text-danger">{t.entryDragPct}%</td>
                  <td className="px-3 py-2">{t.liveMc != null ? fmtUsd(t.liveMc) : "—"}</td>
                  <td className="px-3 py-2">
                    {t.livePnlPct != null ? (
                      <span className={t.livePnlPct >= 0 ? "text-accent" : "text-danger"}>
                        {t.livePnlPct}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <OutcomeBadge o={t.outcome} />
                  </td>
                </tr>
              ))}
              {(data?.trades?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-fg-muted">
                    No trades yet. Waiting for Cupsey's next move.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
  const cls = o === "WIN" ? "text-accent" : o === "STOP" ? "text-danger" : "text-fg-muted";
  return <span className={cls}>{o}</span>;
}
