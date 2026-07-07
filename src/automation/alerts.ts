/**
 * Alerting: surface partners with sudden EPC drops or spikes in reversed/rejected
 * actions by comparing a recent window against the prior window. The per-partner
 * decision logic is a pure function (`evaluatePartner`) with unit tests; the DB
 * queries just feed it.
 */
import type { Database } from "../sync/db.js";
import { daysAgo } from "../util/date.js";
import { epc as computeEpc } from "../sync/metrics.js";

export interface WindowMetric {
  mediaId: string;
  name: string | null;
  clicks: number;
  actions: number; // total actions in window
  revenue: number; // approved revenue
  reversed: number; // reversed + rejected count
}

export interface Alert {
  kind: "epc_drop" | "reversal_spike";
  mediaId: string;
  name: string | null;
  severity: "warn" | "critical";
  message: string;
  data: Record<string, number>;
}

export interface AlertThresholds {
  /** Fractional EPC drop that triggers (0.5 = down 50%). */
  epcDropPct: number;
  /** Minimum prior-window revenue for an EPC-drop alert to matter. */
  minPriorRevenue: number;
  /** Reversed+rejected share of total actions that triggers. */
  reversalRatio: number;
  /** Minimum actions in the recent window for a reversal alert. */
  minActions: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  epcDropPct: 0.5,
  minPriorRevenue: 100,
  reversalRatio: 0.3,
  minActions: 5,
};

/** Pure: evaluate one partner's prior vs recent window. */
export function evaluatePartner(prev: WindowMetric, curr: WindowMetric, t: AlertThresholds): Alert[] {
  const alerts: Alert[] = [];
  const prevEpc = computeEpc(prev.revenue, prev.clicks);
  const currEpc = computeEpc(curr.revenue, curr.clicks);

  if (prevEpc > 0 && prev.revenue >= t.minPriorRevenue && currEpc < prevEpc * (1 - t.epcDropPct)) {
    const dropPct = (1 - currEpc / prevEpc) * 100;
    alerts.push({
      kind: "epc_drop",
      mediaId: curr.mediaId,
      name: curr.name,
      severity: dropPct >= 80 ? "critical" : "warn",
      message: `EPC dropped ${dropPct.toFixed(0)}% (${prevEpc.toFixed(3)} → ${currEpc.toFixed(3)})`,
      data: { prevEpc, currEpc, dropPct },
    });
  }

  if (curr.actions >= t.minActions) {
    const ratio = curr.reversed / curr.actions;
    if (ratio > t.reversalRatio) {
      alerts.push({
        kind: "reversal_spike",
        mediaId: curr.mediaId,
        name: curr.name,
        severity: ratio >= 0.6 ? "critical" : "warn",
        message: `${(ratio * 100).toFixed(0)}% of ${curr.actions} actions reversed/rejected`,
        data: { reversed: curr.reversed, actions: curr.actions, ratio },
      });
    }
  }
  return alerts;
}

async function windowMetrics(db: Database, start: Date, end: Date): Promise<Map<string, WindowMetric>> {
  const rows = await db.query<{
    media_id: string;
    name: string | null;
    clicks: string;
    actions: string;
    revenue: string;
    reversed: string;
  }>(
    `WITH c AS (
        SELECT media_id, count(*)::bigint clicks FROM clicks
        WHERE event_date >= $1 AND event_date < $2 GROUP BY media_id
     ), a AS (
        SELECT media_id, count(*)::bigint actions,
               coalesce(sum(amount) FILTER (WHERE state = 'APPROVED'), 0) revenue,
               count(*) FILTER (WHERE state IN ('REVERSED','REJECTED'))::bigint reversed
        FROM actions WHERE event_date >= $1 AND event_date < $2 GROUP BY media_id
     )
     SELECT coalesce(a.media_id, c.media_id) media_id, p.name,
            coalesce(c.clicks,0) clicks, coalesce(a.actions,0) actions,
            coalesce(a.revenue,0) revenue, coalesce(a.reversed,0) reversed
     FROM a FULL OUTER JOIN c ON a.media_id = c.media_id
     LEFT JOIN partners p ON p.media_id = coalesce(a.media_id, c.media_id)`,
    [start.toISOString(), end.toISOString()],
  );
  const map = new Map<string, WindowMetric>();
  for (const r of rows) {
    if (!r.media_id) continue;
    map.set(r.media_id, {
      mediaId: r.media_id,
      name: r.name,
      clicks: Number(r.clicks) || 0,
      actions: Number(r.actions) || 0,
      revenue: Number(r.revenue) || 0,
      reversed: Number(r.reversed) || 0,
    });
  }
  return map;
}

export async function computeAlerts(
  db: Database,
  opts: { recentDays?: number; thresholds?: Partial<AlertThresholds>; now?: Date } = {},
): Promise<Alert[]> {
  const recentDays = opts.recentDays ?? 7;
  const now = opts.now ?? new Date();
  const t = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };

  const recentStart = daysAgo(recentDays, now);
  const priorStart = daysAgo(recentDays * 2, now);
  const recent = await windowMetrics(db, recentStart, now);
  const prior = await windowMetrics(db, priorStart, recentStart);

  const alerts: Alert[] = [];
  for (const [mediaId, curr] of recent) {
    const prev = prior.get(mediaId) ?? { mediaId, name: curr.name, clicks: 0, actions: 0, revenue: 0, reversed: 0 };
    alerts.push(...evaluatePartner(prev, curr, t));
  }
  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
