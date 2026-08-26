import { Badge } from "@/components/ui/badge";
import {
  TokenStatsGrid,
  OrderPanelMock,
  ChartPlaceholder,
  TradesFeed,
} from "./parts";

export const metadata = { title: "Trade" };

/**
 * Flagship view — the Axiom-style three-zone terminal:
 * [token analytics | chart | order panel] + bottom tape.
 * Data wiring lands in Sprint 1 (React Query + DexScreener adapter);
 * this composition proves the density/aesthetic target.
 */
export default function TradePage() {
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* token header strip */}
      <div className="panel flex h-14 shrink-0 items-center gap-4 px-4">
        <span className="flex size-8 items-center justify-center rounded-full bg-surface-4 text-xs font-bold">
          WIF
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">dogwifhat</span>
            <Badge variant="blue">SOLANA</Badge>
          </div>
          <span className="num text-[11px] text-fg-muted">
            EKpQ…x7fD · Pair age 214d
          </span>
        </div>
        <div className="ml-6 num">
          <div className="text-lg font-semibold">$2.8471</div>
          <div className="text-xs text-green">+12.4%</div>
        </div>
        <Badge variant="green" className="ml-auto">
          SIMULATED FEED
        </Badge>
      </div>

      {/* main three-zone grid */}
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-2">
        {/* left rail: analytics */}
        <div className="col-span-3 flex min-h-0 flex-col gap-2 overflow-auto pr-0.5">
          <TokenStatsGrid />
          <TradesFeed />
        </div>

        {/* center: chart */}
        <div className="col-span-6 min-h-0">
          <ChartPlaceholder />
        </div>

        {/* right rail: order panel */}
        <div className="col-span-3 min-h-0 overflow-auto pl-0.5">
          <OrderPanelMock />
        </div>
      </div>

      {/* bottom tape */}
      <div className="panel flex h-9 shrink-0 items-center gap-5 overflow-x-auto px-4">
        <span className="label-caps shrink-0">Watchlist</span>
        {[
          ["SOL", "+4.2"],
          ["WIF", "+12.4"],
          ["BONK", "-3.1"],
          ["POPCAT", "+41.7"],
          ["JUP", "+1.8"],
          ["MEW", "-9.6"],
        ].map(([sym, chg]) => (
          <span key={sym} className="num shrink-0 text-xs">
            <span className="text-fg-dim">{sym}</span>{" "}
            <span className={chg.startsWith("+") ? "text-green" : "text-red"}>
              {chg}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
