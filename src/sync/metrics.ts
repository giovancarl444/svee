/**
 * Dashboard metrics computed from the warehouse. The derived-math bits (EPC,
 * conversion rate) are pure functions with unit tests; the rest is SQL.
 *
 * Metrics surfaced (§Phase 2): affiliates by revenue, EPC, conversion rate,
 * pending vs approved actions, top catalog items, daily trend.
 */
import type { Database } from "./db.js";
import { ACTION_STATE } from "../types/impact.js";

/** Earnings per click. Guards div-by-zero. */
export function epc(revenue: number, clicks: number): number {
  return clicks > 0 ? revenue / clicks : 0;
}

/** Conversion rate = actions / clicks. Guards div-by-zero. */
export function conversionRate(actions: number, clicks: number): number {
  return clicks > 0 ? actions / clicks : 0;
}

export interface AffiliateMetric {
  mediaId: string;
  name: string | null;
  clicks: number;
  actions: number;
  revenue: number;
  payout: number;
  epc: number;
  conversionRate: number;
}

export interface DashboardMetrics {
  generatedAt: string;
  currency: string;
  totals: {
    clicks: number;
    actions: number;
    revenue: number;
    payout: number;
    epc: number;
    conversionRate: number;
  };
  actionsByState: { pending: number; approved: number; reversed: number; rejected: number; other: number };
  topAffiliates: AffiliateMetric[];
  topCatalogItems: Array<{ id: string; name: string | null; category: string | null; price: number | null }>;
  dailyTrend: Array<{ day: string; clicks: number; actions: number; revenue: number }>;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function computeDashboardMetrics(
  db: Database,
  opts: { currency: string; topN?: number; trendDays?: number; now?: Date } = { currency: "SEK" },
): Promise<DashboardMetrics> {
  const topN = opts.topN ?? 10;
  const trendDays = opts.trendDays ?? 30;
  const generatedAt = (opts.now ?? new Date()).toISOString();

  // Per-affiliate: clicks from clicks table, actions/revenue/payout from actions.
  const affiliateRows = await db.query<{
    media_id: string;
    name: string | null;
    clicks: string;
    actions: string;
    revenue: string;
    payout: string;
  }>(
    `WITH c AS (
       SELECT media_id, count(*)::bigint AS clicks FROM clicks GROUP BY media_id
     ), a AS (
       SELECT media_id,
              count(*)::bigint AS actions,
              coalesce(sum(amount) FILTER (WHERE state = $1), 0) AS revenue,
              coalesce(sum(payout) FILTER (WHERE state = $1), 0) AS payout
       FROM actions GROUP BY media_id
     )
     SELECT coalesce(a.media_id, c.media_id) AS media_id, p.name,
            coalesce(c.clicks, 0) AS clicks,
            coalesce(a.actions, 0) AS actions,
            coalesce(a.revenue, 0) AS revenue,
            coalesce(a.payout, 0) AS payout
     FROM a FULL OUTER JOIN c ON a.media_id = c.media_id
     LEFT JOIN partners p ON p.media_id = coalesce(a.media_id, c.media_id)
     ORDER BY revenue DESC NULLS LAST
     LIMIT $2`,
    [ACTION_STATE.approved, topN],
  );

  const topAffiliates: AffiliateMetric[] = affiliateRows.map((r) => {
    const clicks = num(r.clicks);
    const actions = num(r.actions);
    const revenue = num(r.revenue);
    return {
      mediaId: r.media_id,
      name: r.name,
      clicks,
      actions,
      revenue,
      payout: num(r.payout),
      epc: epc(revenue, clicks),
      conversionRate: conversionRate(actions, clicks),
    };
  });

  const stateRows = await db.query<{ state: string | null; n: string }>(
    `SELECT state, count(*)::bigint AS n FROM actions GROUP BY state`,
  );
  const actionsByState = { pending: 0, approved: 0, reversed: 0, rejected: 0, other: 0 };
  for (const row of stateRows) {
    const n = num(row.n);
    switch ((row.state ?? "").toUpperCase()) {
      case ACTION_STATE.pending:
        actionsByState.pending += n;
        break;
      case ACTION_STATE.approved:
        actionsByState.approved += n;
        break;
      case ACTION_STATE.reversed:
        actionsByState.reversed += n;
        break;
      case ACTION_STATE.rejected:
        actionsByState.rejected += n;
        break;
      default:
        actionsByState.other += n;
    }
  }

  const totalRow = (
    await db.query<{ clicks: string; actions: string; revenue: string; payout: string }>(
      `SELECT (SELECT count(*) FROM clicks) AS clicks,
              (SELECT count(*) FROM actions) AS actions,
              (SELECT coalesce(sum(amount),0) FROM actions WHERE state = $1) AS revenue,
              (SELECT coalesce(sum(payout),0) FROM actions WHERE state = $1) AS payout`,
      [ACTION_STATE.approved],
    )
  )[0];
  const totalClicks = num(totalRow?.clicks);
  const totalActions = num(totalRow?.actions);
  const totalRevenue = num(totalRow?.revenue);

  const catalogRows = await db.query<{ catalog_item_id: string; name: string | null; category: string | null; current_price: string | null }>(
    `SELECT catalog_item_id, name, category, current_price FROM catalog_items
     ORDER BY current_price DESC NULLS LAST LIMIT $1`,
    [topN],
  );

  const trendRows = await db.query<{ day: string; clicks: string; actions: string; revenue: string }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day,
            sum(clicks)::bigint AS clicks, sum(actions)::bigint AS actions, sum(revenue) AS revenue
     FROM daily_performance
     WHERE day >= (current_date - $1::int)
     GROUP BY day ORDER BY day`,
    [trendDays],
  );

  return {
    generatedAt,
    currency: opts.currency,
    totals: {
      clicks: totalClicks,
      actions: totalActions,
      revenue: totalRevenue,
      payout: num(totalRow?.payout),
      epc: epc(totalRevenue, totalClicks),
      conversionRate: conversionRate(totalActions, totalClicks),
    },
    actionsByState,
    topAffiliates,
    topCatalogItems: catalogRows.map((r) => ({
      id: r.catalog_item_id,
      name: r.name,
      category: r.category,
      price: r.current_price != null ? num(r.current_price) : null,
    })),
    dailyTrend: trendRows.map((r) => ({ day: r.day, clicks: num(r.clicks), actions: num(r.actions), revenue: num(r.revenue) })),
  };
}
