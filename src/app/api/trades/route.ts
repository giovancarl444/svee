import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { apiOk, apiErr } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/trades — paper-scalp trades from MEGAPHONE.
 * MEGAPHONE writes paper-trades.csv to <MEGAPHONE_DIR>/.megaphone/.
 * Each row: mint, symbol, entryUsd, targetUsd, exitUsd, exitMult, outcome, enteredAt, exitedAt.
 */
const MEGAPHONE_DIR = process.env.MEGAPHONE_DIR ?? path.resolve(process.cwd(), "../megaphone");
const TRADES = path.join(MEGAPHONE_DIR, ".megaphone", "paper-trades.csv");

async function readCsv(p: string): Promise<Record<string, string>[]> {
  try {
    const raw = await fs.readFile(p, "utf8");
    const lines = raw.trim().split("\n");
    if (lines.length < 2) return [];
    const header = lines[0].split(",");
    return lines.slice(1).map((l) => {
      const cells = l.split(",");
      const o: Record<string, string> = {};
      header.forEach((h, i) => (o[h] = cells[i] ?? ""));
      return o;
    });
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // OPEN | WIN | STOP | all
  try {
    const rows = await readCsv(TRADES);
    const num = (v: string) => parseFloat(v) || 0;
    const trades = rows
      .map((r) => ({
        mint: r.mint,
        symbol: r.symbol,
        entryUsd: num(r.entryUsd),
        targetUsd: num(r.targetUsd),
        stopUsd: num(r.exitUsd),
        exitUsd: num(r.exitUsd),
        exitMult: num(r.exitMult),
        outcome: r.outcome,
        enteredAt: num(r.enteredAt),
        exitedAt: r.exitedAt ? num(r.exitedAt) : null,
        pnlPct: r.outcome === "WIN" ? 100 : r.outcome === "STOP" ? -30 : 0,
      }))
      .filter((t) => (status && status !== "all" ? t.outcome === status : true))
      .sort((a, b) => b.enteredAt - a.enteredAt);
    const open = trades.filter((t) => t.outcome === "OPEN").length;
    const wins = trades.filter((t) => t.outcome === "WIN").length;
    const stops = trades.filter((t) => t.outcome === "STOP").length;
    return apiOk({ trades, summary: { open, wins, stops, total: trades.length } });
  } catch (e) {
    return apiErr(500, "read_error", String(e));
  }
}
