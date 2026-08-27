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

// live mc for open trades: read the latest path sample written by the watcher
// (already USD via chain-native mcUsd). No pump.fun API call (CF-flaky, SOL units).
async function liveMcFromPath(t: any): Promise<number> {
  const p = t.path;
  if (Array.isArray(p) && p.length > 0) return p[p.length - 1].mc;
  return 0;
}

export async function GET(req: NextRequest) {
  try {
    const trades = await readTrades();
    const open = trades.filter((t: any) => t.outcome === "OPEN");
    // enrich open trades with live PnL
    const enriched = await Promise.all(
      trades.map(async (t: any) => {
        if (t.outcome !== "OPEN") return t;
        const mc = await liveMcFromPath(t);
        const pnlPct = t.ourMc > 0 ? Math.round(((mc - t.ourMc) / t.ourMc) * 1000) / 10 : 0;
        return { ...t, liveMc: Math.round(mc), livePnlPct: pnlPct };
      }),
    );
    const wins = trades.filter((t: any) => t.outcome === "WIN").length;
    const stops = trades.filter((t: any) => t.outcome === "STOP").length;
    const copyExits = trades.filter((t: any) => t.outcome === "HISSELL").length;
    return apiOk({
      trades: enriched,
      summary: { total: trades.length, open: open.length, wins, stops, copyExits },
    });
  } catch (e) {
    return apiErr(500, "read_error", String(e));
  }
}
