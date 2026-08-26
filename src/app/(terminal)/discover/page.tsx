import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Discover" };

const TABS = ["Trending", "New Pairs", "Top Gainers", "Top Losers"] as const;

interface Row {
  symbol: string;
  name: string;
  price: string;
  m5: number;
  h1: number;
  h24: number;
  vol: string;
  liq: string;
  mc: string;
  age: string;
}

const ROWS: Row[] = [
  { symbol: "WIF", name: "dogwifhat", price: "$2.8471", m5: 0.4, h1: 2.1, h24: 12.4, vol: "$412M", liq: "$18.4M", mc: "$2.84B", age: "214d" },
  { symbol: "POPCAT", name: "Popcat", price: "$1.2044", m5: 1.9, h1: 8.3, h24: 41.7, vol: "$188M", liq: "$9.2M", mc: "$1.18B", age: "187d" },
  { symbol: "BONK", name: "Bonk", price: "$0.00002120", m5: -0.3, h1: -1.2, h24: -3.1, vol: "$96M", liq: "$22.1M", mc: "$1.42B", age: "892d" },
  { symbol: "MOODENG", name: "Moo Deng", price: "$0.1647", m5: 2.8, h1: 5.5, h24: 18.9, vol: "$44M", liq: "$3.8M", mc: "$164M", age: "102d" },
  { symbol: "PNUT", name: "Peanut", price: "$0.3821", m5: -1.1, h1: 1.4, h24: 23.0, vol: "$61M", liq: "$4.4M", mc: "$382M", age: "88d" },
  { symbol: "MEW", name: "cat in a dogs world", price: "$0.004120", m5: -0.8, h1: -2.4, h24: -9.6, vol: "$28M", liq: "$6.7M", mc: "$366M", age: "176d" },
  { symbol: "GOAT", name: "Goatseus Maximus", price: "$0.7042", m5: 3.4, h1: 11.2, h24: 34.5, vol: "$52M", liq: "$2.9M", mc: "$704M", age: "121d" },
];

function Cell({ v }: { v: number }) {
  if (v === 0) return <span className="num text-fg-muted">0.0%</span>;
  return (
    <span className={`num ${v > 0 ? "text-green" : "text-red"}`}>
      {v > 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

/** Sprint 1 wires this to GET /api/market/discover — composition + density target now */
export default function DiscoverPage() {
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* search + chain filter bar */}
      <div className="panel flex h-11 shrink-0 items-center gap-3 px-3">
        <input
          placeholder="Search name or contract address…"
          className="num h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-muted"
        />
        <Badge>SOLANA</Badge>
        <Badge variant="outline">ALL CHAINS</Badge>
      </div>

      <div className="panel min-h-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-surface-2 px-3 py-2">
          {TABS.map((t, i) => (
            <button
              key={t}
              className={`label-caps rounded px-3 py-1.5 transition-colors ${
                i === 0
                  ? "bg-surface-4 text-fg"
                  : "text-fg-muted hover:bg-surface-3 hover:text-fg-dim"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="label-caps border-b border-line text-[10px] [&>th]:px-3 [&>th]:py-2">
              <th>Token</th>
              <th>Price</th>
              <th>5m</th>
              <th>1h</th>
              <th>24h</th>
              <th>Volume</th>
              <th>Liquidity</th>
              <th>MC</th>
              <th>Age</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr
                key={r.symbol}
                className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-surface-3"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-surface-4 text-[9px] font-bold">
                      {r.symbol.slice(0, 3)}
                    </span>
                    <div>
                      <div className="font-medium">{r.symbol}</div>
                      <div className="text-[11px] text-fg-muted">{r.name}</div>
                    </div>
                  </div>
                </td>
                <td className="num px-3 py-2">{r.price}</td>
                <td className="px-3 py-2"><Cell v={r.m5} /></td>
                <td className="px-3 py-2"><Cell v={r.h1} /></td>
                <td className="px-3 py-2"><Cell v={r.h24} /></td>
                <td className="num px-3 py-2">{r.vol}</td>
                <td className="num px-3 py-2 text-fg-dim">{r.liq}</td>
                <td className="num px-3 py-2 text-fg-dim">{r.mc}</td>
                <td className="num px-3 py-2 text-fg-muted">{r.age}</td>
                <td className="px-3 py-2 text-right">
                  <Badge variant="green">TRADE</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
