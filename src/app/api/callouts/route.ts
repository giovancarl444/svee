import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { apiOk, apiErr } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/callouts — curated pump.fun calls from MEGAPHONE.
 *
 * MEGAPHONE (the callout engine) writes its shared ledger to
 *   <MEGAPHONE_DIR>/.megaphone/callouts.json
 * This route reads that same file so the terminal can show + execute the
 * calls. Point MEGAPHONE_DIR at the MEGAPHONE repo via env (default: ../megaphone).
 */
const MEGAPHONE_DIR = process.env.MEGAPHONE_DIR ?? path.resolve(process.cwd(), "../megaphone");
const LEDGER = path.join(MEGAPHONE_DIR, ".megaphone", "callouts.json");

interface Callout {
  mint: string;
  symbol: string;
  name?: string;
  source: "firehose" | "whale-mirror";
  sourceHandle?: string;
  calledAt: number;
  calledMcUsd: number;
  score: number;
  reasons: string[];
  socials: string[];
  resolvedAt?: number;
  resolvedMcUsd?: number;
  multiple?: number;
  graduated?: boolean;
  notes?: string;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const only = url.searchParams.get("status"); // "open" | "resolved" | all
  try {
    const raw = await fs.readFile(LEDGER, "utf8");
    let calls = JSON.parse(raw) as Callout[];
    if (only === "open") calls = calls.filter((c) => c.resolvedAt === undefined);
    else if (only === "resolved") calls = calls.filter((c) => c.resolvedAt !== undefined);
    const resolved = calls.filter((c) => c.multiple !== undefined);
    const wins = resolved.filter((c) => (c.multiple ?? 0) >= 1.5).length;
    const losses = resolved.filter((c) => (c.multiple ?? 0) < 1).length;
    const multiples = resolved.map((c) => c.multiple ?? 0);
    const tr = {
      total: calls.length,
      resolved: resolved.length,
      wins,
      losses,
      avgMultiple: multiples.length ? multiples.reduce((a, b) => a + b, 0) / multiples.length : 0,
      bestMultiple: multiples.length ? Math.max(...multiples) : 0,
      winRate: resolved.length ? wins / resolved.length : 0,
    };
    return apiOk({ callouts: calls.slice(0, 100), trackRecord: tr });
  } catch (e) {
    // No ledger yet (MEGAPHONE hasn't logged anything) — return empty, not 500.
    return apiOk({
      callouts: [],
      trackRecord: { total: 0, resolved: 0, wins: 0, losses: 0, avgMultiple: 0, bestMultiple: 0, winRate: 0 },
      note: `ledger not found at ${LEDGER}`,
    });
  }
}
