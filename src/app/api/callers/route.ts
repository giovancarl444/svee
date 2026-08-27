import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { apiOk, apiErr } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/callers — per-caller leaderboard from MEGAPHONE's caller sheet.
 * MEGAPHONE writes callers.csv to <MEGAPHONE_DIR>/.megaphone/.
 * One row per call: caller, symbol, mint, multiple, calledMcUsd, source, thesis, broadcasted.
 */
const MEGAPHONE_DIR = process.env.MEGAPHONE_DIR ?? path.resolve(process.cwd(), "../megaphone");
const SHEET = path.join(MEGAPHONE_DIR, ".megaphone", "callers.csv");

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
  try {
    const rows = await readCsv(SHEET);
    const byCaller = new Map<string, { calls: number; wins: number; best: number; totalMult: number }>();
    for (const r of rows) {
      const h = r.caller || "unknown";
      const mult = parseFloat(r.multiple) || 0;
      const cur = byCaller.get(h) ?? { calls: 0, wins: 0, best: 0, totalMult: 0 };
      cur.calls++;
      if (mult >= 1.5) cur.wins++;
      cur.best = Math.max(cur.best, mult);
      cur.totalMult += mult;
      byCaller.set(h, cur);
    }
    const leaders = [...byCaller.entries()]
      .map(([handle, s]) => ({
        handle,
        calls: s.calls,
        wins: s.wins,
        winRate: s.calls ? s.wins / s.calls : 0,
        best: s.best,
        avgMultiple: s.calls ? s.totalMult / s.calls : 0,
      }))
      .sort((a, b) => b.best - a.best);
    return apiOk({ leaders });
  } catch (e) {
    return apiErr(500, "read_error", String(e));
  }
}
