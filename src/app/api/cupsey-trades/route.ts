import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { apiOk, apiErr } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/cupsey-trades — live paper trades from MEGAPHONE cupsey-watch.
 * Reads D:/megaphone/.megaphone/cupsey-trades.json (hisMc / ourMc / drag / outcome).
 */
const TRADES = "D:/megaphone/.megaphone/cupsey-trades.json";

async function readTrades(): Promise<any[]> {
  try {
    const raw = await fs.readFile(TRADES, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// live mc for open trades (so the dashboard can show current PnL)
async function liveMc(mint: string): Promise<number> {
  try {
    const res = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return 0;
    const j = (await res.json()) as any;
    return Number(j?.market_cap ?? 0);
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  try {
    const trades = await readTrades();
    const open = trades.filter((t: any) => t.outcome === "OPEN");
    // enrich open trades with live PnL
    const enriched = await Promise.all(
      trades.map(async (t: any) => {
        if (t.outcome !== "OPEN") return t;
        const mc = await liveMc(t.mint);
        const pnlPct = t.ourMc > 0 ? Math.round(((mc - t.ourMc) / t.ourMc) * 1000) / 10 : 0;
        return { ...t, liveMc: Math.round(mc), livePnlPct: pnlPct };
      }),
    );
    const wins = trades.filter((t: any) => t.outcome === "WIN").length;
    const stops = trades.filter((t: any) => t.outcome === "STOP").length;
    return apiOk({
      trades: enriched,
      summary: { total: trades.length, open: open.length, wins, stops },
    });
  } catch (e) {
    return apiErr(500, "read_error", String(e));
  }
}
