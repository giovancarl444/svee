import { Badge } from "@/components/ui/badge";
import { PnlText, PnlUsd } from "@/components/shared/pnl-text";

export const metadata = { title: "Leaderboard" };

const PERIODS = ["Daily", "Weekly", "Monthly", "All-Time"] as const;

interface Row {
  rank: number;
  trader: string;
  pnl: number;
  roi: number;
  winRate: number;
  trades: number;
  volume: string;
}

const ROWS: Row[] = [
  { rank: 1, trader: "solshottaz", pnl: 48213.44, roi: 482.1, winRate: 68.4, trades: 214, volume: "$1.24M" },
  { rank: 2, trader: "candlewick", pnl: 31890.02, roi: 318.9, winRate: 61.2, trades: 187, volume: "$980K" },
  { rank: 3, trader: "sniper_ellie", pnl: 27455.18, roi: 274.6, winRate: 57.8, trades: 342, volume: "$2.1M" },
  { rank: 4, trader: "rug_survivor", pnl: 19877.9, roi: 198.8, winRate: 54.1, trades: 156, volume: "$742K" },
  { rank: 5, trader: "topo_gigio", pnl: 15420.31, roi: 154.2, winRate: 49.9, trades: 98, volume: "$512K" },
];

/** Sprint 3 wires this to GET /api/leaderboard (snapshot table reads) */
export default function LeaderboardPage() {
  return (
    <div className="mx-auto h-full max-w-4xl space-y-2 overflow-auto p-2">
      <div className="flex items-center gap-3">
        {PERIODS.map((p, i) => (
          <button
            key={p}
            className={`label-caps rounded-md px-3 py-1.5 transition-colors ${
              i === 1
                ? "bg-accent/15 text-accent"
                : "text-fg-muted hover:bg-surface-3 hover:text-fg-dim"
            }`}
          >
            {p}
          </button>
        ))}
        <Badge variant="outline" className="ml-auto">
          WEEKLY RESETS MON 00:00 UTC
        </Badge>
      </div>

      <div className="panel overflow-hidden p-0">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="label-caps border-b border-line text-[10px] [&>th]:px-4 [&>th]:py-3">
              <th>Rank</th>
              <th>Trader</th>
              <th>PnL</th>
              <th>ROI</th>
              <th>Win Rate</th>
              <th>Trades</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr
                key={r.rank}
                className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3"
              >
                <td className="num px-4 py-3 font-semibold">
                  {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}
                </td>
                <td className="px-4 py-3 font-medium">{r.trader}</td>
                <td className="px-4 py-3"><PnlUsd value={r.pnl} /></td>
                <td className="px-4 py-3"><PnlText value={r.roi} /></td>
                <td className="num px-4 py-3 text-fg-dim">{r.winRate}%</td>
                <td className="num px-4 py-3 text-fg-dim">{r.trades}</td>
                <td className="num px-4 py-3 text-fg-dim">{r.volume}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="py-4 text-center text-xs text-fg-muted">
        Demo data — live rankings begin once the first traders make their mark.
      </p>
    </div>
  );
}
