import { Badge } from "@/components/ui/badge";
import { PnlText } from "@/components/shared/pnl-text";

export const metadata = { title: "Pulse" };

/** Momentum feed — Sprint 2 wires to GET /api/market/pulse */
export default function PulsePage() {
  return (
    <div className="h-full overflow-auto p-2">
      <div className="mb-2 flex items-center gap-3">
        <p className="label-caps">Live Momentum Feed</p>
        <Badge variant="green">VOLUME SPIKES · SIMULATED TAPE</Badge>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        {EVENTS.map((e) => (
          <article key={e.sym} className="panel panel-hover p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-full bg-surface-4 text-[10px] font-bold">
                  {e.sym.slice(0, 3)}
                </span>
                <div>
                  <div className="text-sm font-semibold">{e.sym}</div>
                  <div className="text-[11px] text-fg-muted">{e.pair}</div>
                </div>
              </div>
              <PnlText value={e.h1} />
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-dim">{e.reason}</p>
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              {e.flags.map((f) => (
                <Badge key={f} variant={f.includes("×") ? "red" : "blue"}>
                  {f}
                </Badge>
              ))}
              <span className="num ml-auto text-[11px] text-fg-muted">{e.when}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const EVENTS = [
  { sym: "GOAT", pair: "GOAT / SOL", h1: 11.2, reason: "Volume ×4.2 over baseline — $52M in, buyers absorbing every dip. Liquidity deepening.", flags: ["VOL ×4.2", "NEW WHALES"], when: "2m ago" },
  { sym: "MOODENG", pair: "MOODENG / SOL", h1: 5.5, reason: "Steady accumulation pattern — 14 of last 16 five-minute candles closed green.", flags: ["ACCUMULATION"], when: "6m ago" },
  { sym: "WIF", pair: "WIF / SOL", h1: 2.1, reason: "Breakout above weekly range. CEX listing rumor circulating on X.", flags: ["BREAKOUT"], when: "9m ago" },
  { sym: "PNUT", pair: "PNUT / SOL", h1: 1.4, reason: "Vol spike without price follow-through — watch for distribution.", flags: ["VOL ×2.1", "CAUTION"], when: "14m ago" },
  { sym: "POPCAT", pair: "POPCAT / SOL", h1: 8.3, reason: "Vertical move off support. Funding flipping positive across perps.", flags: ["MOMENTUM"], when: "21m ago" },
  { sym: "BONK", pair: "BONK / SOL", h1: -1.2, reason: "Bleeding continues. Top-10 holders added 1.8% supply — not bullish.", flags: ["SUPPLY SHIFT"], when: "27m ago" },
];
