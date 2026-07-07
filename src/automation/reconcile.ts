/**
 * Reconciliation: compare the API (source of truth) against the synced DB for a
 * window and report drift. Run nightly; non-zero drift means the sync missed
 * (or double-counted) rows and needs investigation.
 *
 * We reconcile ACTIONS (not the performance report, which itself feeds
 * daily_performance and would be circular): pull action count + approved revenue
 * from the API for the window, compare to the DB actions table.
 */
import type { ImpactClient } from "../client/impact-client.js";
import type { Database } from "../sync/db.js";
import { collect } from "../client/pagination.js";
import { toNumber } from "../util/coerce.js";
import { lastNDays } from "../util/date.js";
import { ACTION_STATE } from "../types/impact.js";

export interface Drift {
  metric: string;
  api: number;
  db: number;
  drift: number;
  withinTolerance: boolean;
}

export interface ReconResult {
  window: { start: string; end: string };
  drifts: Drift[];
  ok: boolean;
}

function drift(metric: string, api: number, db: number, tolerance: number): Drift {
  const d = api - db;
  return { metric, api, db, drift: d, withinTolerance: Math.abs(d) <= tolerance };
}

export async function reconcileActions(
  client: ImpactClient,
  db: Database,
  opts: { days?: number; countTolerance?: number; revenueTolerance?: number; now?: Date } = {},
): Promise<ReconResult> {
  const range = lastNDays(opts.days ?? 7, opts.now);
  const countTol = opts.countTolerance ?? 0;
  const revTol = opts.revenueTolerance ?? 0.01;

  // API side (authoritative).
  const apiActions = await collect(client.actions.iterate({ startDate: range.start, endDate: range.end }));
  const apiCount = apiActions.length;
  const apiRevenue = apiActions
    .filter((a) => String(a.State ?? a.Status ?? "").toUpperCase() === ACTION_STATE.approved)
    .reduce((sum, a) => sum + (toNumber(a.Amount) ?? 0), 0);

  // DB side.
  const dbRows = await db.query<{ n: string; revenue: string }>(
    `SELECT count(*)::bigint n, coalesce(sum(amount) FILTER (WHERE state = $3), 0) revenue
     FROM actions WHERE event_date >= $1 AND event_date < $2`,
    [range.start.toISOString(), range.end.toISOString(), ACTION_STATE.approved],
  );
  const dbCount = Number(dbRows[0]?.n ?? 0);
  const dbRevenue = Number(dbRows[0]?.revenue ?? 0);

  const drifts = [
    drift("action_count", apiCount, dbCount, countTol),
    drift("approved_revenue", round(apiRevenue), round(dbRevenue), revTol),
  ];
  return {
    window: { start: range.start.toISOString(), end: range.end.toISOString() },
    drifts,
    ok: drifts.every((d) => d.withinTolerance),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
