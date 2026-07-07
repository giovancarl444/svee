/**
 * Dashboard metrics computed from the warehouse. Derived math (EPC, conversion
 * rate, reversal rate) is pure + unit-tested; the rest is SQL.
 *
 * Breakdowns surfaced:
 *   - totals with a value funnel (pending/approved/reversed value)
 *   - by partner (brand persona) / by program (partner persona)
 *   - by SubId1 — the Shopify-affiliate tracking dimension (store/placement/UTM)
 *   - daily trend (clicks, actions, revenue, EPC)
 *   - media properties + deals (partner persona)
 *   - top catalog items
 */
import type { Database } from "./db.js";
import type { Persona } from "../client/persona.js";
import { ACTION_STATE } from "../types/impact.js";

/** Earnings per click. Guards div-by-zero. */
export function epc(revenue: number, clicks: number): number {
  return clicks > 0 ? revenue / clicks : 0;
}

/** Conversion rate = actions / clicks. Guards div-by-zero. */
export function conversionRate(actions: number, clicks: number): number {
  return clicks > 0 ? actions / clicks : 0;
}

/** Reversal rate = reversed+rejected / total actions. Guards div-by-zero. */
export function reversalRate(reversed: number, totalActions: number): number {
  return totalActions > 0 ? reversed / totalActions : 0;
}

export interface Breakdown {
  key: string;
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
  persona: Persona;
  totals: {
    clicks: number;
    actions: number;
    revenue: number;
    payout: number;
    epc: number;
    conversionRate: number;
    pendingValue: number;
    approvedValue: number;
    reversedValue: number;
    reversalRate: number;
  };
  actionsByState: { pending: number; approved: number; reversed: number; rejected: number; other: number };
  dailyTrend: Array<{ day: string; clicks: number; actions: number; revenue: number; epc: number }>;
  topPartners: Breakdown[];
  topPrograms: Breakdown[];
  bySubId: Breakdown[];
  topCatalogItems: Array<{ id: string; name: string | null; category: string | null; price: number | null }>;
  properties: Array<{ id: string; name: string | null; type: string | null; status: string | null }>;
  deals: Array<{ id: string; name: string | null; advertiser: string | null; endDate: string | null }>;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Group clicks + actions by an internal column (media_id | campaign_id | subid1)
 * and compute per-key metrics. `column`/`nameExpr`/`nameJoin` are internal
 * constants (never user input), so interpolation here is safe.
 */
async function breakdownBy(
  db: Database,
  column: string,
  nameExpr: string,
  nameJoin: string,
  topN: number,
): Promise<Breakdown[]> {
  const rows = await db.query<{
    k: string;
    name: string | null;
    clicks: string;
    actions: string;
    revenue: string;
    payout: string;
  }>(
    `WITH c AS (
        SELECT ${column} AS k, count(*)::bigint clicks FROM clicks
        WHERE ${column} IS NOT NULL AND ${column} <> '' GROUP BY ${column}
     ), a AS (
        SELECT ${column} AS k, count(*)::bigint actions,
               coalesce(sum(amount) FILTER (WHERE state = $1), 0) revenue,
               coalesce(sum(payout) FILTER (WHERE state = $1), 0) payout
        FROM actions WHERE ${column} IS NOT NULL AND ${column} <> '' GROUP BY ${column}
     )
     SELECT coalesce(a.k, c.k) k, ${nameExpr} AS name,
            coalesce(c.clicks, 0) clicks, coalesce(a.actions, 0) actions,
            coalesce(a.revenue, 0) revenue, coalesce(a.payout, 0) payout
     FROM a FULL OUTER JOIN c ON a.k = c.k
     ${nameJoin}
     ORDER BY revenue DESC NULLS LAST LIMIT $2`,
    [ACTION_STATE.approved, topN],
  );
  return rows.map((r) => {
    const clicks = num(r.clicks);
    const actions = num(r.actions);
    const revenue = num(r.revenue);
    return {
      key: r.k,
      name: r.name,
      clicks,
      actions,
      revenue,
      payout: num(r.payout),
      epc: epc(revenue, clicks),
      conversionRate: conversionRate(actions, clicks),
    };
  });
}

export async function computeDashboardMetrics(
  db: Database,
  opts: { currency: string; persona?: Persona; topN?: number; trendDays?: number; now?: Date },
): Promise<DashboardMetrics> {
  const topN = opts.topN ?? 10;
  const trendDays = opts.trendDays ?? 30;
  const persona = opts.persona ?? "partner";
  const generatedAt = (opts.now ?? new Date()).toISOString();

  const [topPartners, topPrograms, bySubId] = await Promise.all([
    breakdownBy(db, "media_id", "p.name", "LEFT JOIN partners p ON p.media_id = coalesce(a.k, c.k)", topN),
    breakdownBy(db, "campaign_id", "pr.name", "LEFT JOIN programs pr ON pr.campaign_id = coalesce(a.k, c.k)", topN),
    breakdownBy(db, "subid1", "coalesce(a.k, c.k)", "", topN),
  ]);

  const stateRows = await db.query<{ state: string | null; n: string }>(
    `SELECT state, count(*)::bigint AS n FROM actions GROUP BY state`,
  );
  const actionsByState = { pending: 0, approved: 0, reversed: 0, rejected: 0, other: 0 };
  for (const row of stateRows) {
    const n = num(row.n);
    switch ((row.state ?? "").toUpperCase()) {
      case ACTION_STATE.pending: actionsByState.pending += n; break;
      case ACTION_STATE.approved: actionsByState.approved += n; break;
      case ACTION_STATE.reversed: actionsByState.reversed += n; break;
      case ACTION_STATE.rejected: actionsByState.rejected += n; break;
      default: actionsByState.other += n;
    }
  }

  const totalRow = (
    await db.query<Record<string, string>>(
      `SELECT (SELECT count(*) FROM clicks) AS clicks,
              (SELECT count(*) FROM actions) AS actions,
              (SELECT coalesce(sum(amount),0) FROM actions WHERE state = $1) AS approved_value,
              (SELECT coalesce(sum(amount),0) FROM actions WHERE state = $2) AS pending_value,
              (SELECT coalesce(sum(amount),0) FROM actions WHERE state IN ($3,$4)) AS reversed_value,
              (SELECT count(*) FROM actions WHERE state IN ($3,$4)) AS reversed_ct,
              (SELECT coalesce(sum(payout),0) FROM actions WHERE state = $1) AS payout`,
      [ACTION_STATE.approved, ACTION_STATE.pending, ACTION_STATE.reversed, ACTION_STATE.rejected],
    )
  )[0];
  const totalClicks = num(totalRow?.clicks);
  const totalActions = num(totalRow?.actions);
  const approvedValue = num(totalRow?.approved_value);

  const catalogRows = await db.query<{ catalog_item_id: string; name: string | null; category: string | null; current_price: string | null }>(
    `SELECT catalog_item_id, name, category, current_price FROM catalog_items
     ORDER BY current_price DESC NULLS LAST LIMIT $1`,
    [topN],
  );

  const trendRows = await db.query<{ day: string; clicks: string; actions: string; revenue: string }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day,
            sum(clicks)::bigint AS clicks, sum(actions)::bigint AS actions, sum(revenue) AS revenue
     FROM daily_performance WHERE day >= (current_date - $1::int)
     GROUP BY day ORDER BY day`,
    [trendDays],
  );

  const propertyRows = await db.query<{ id: string; name: string | null; type: string | null; status: string | null }>(
    `SELECT id, name, type, status FROM media_properties ORDER BY name NULLS LAST LIMIT 50`,
  );

  const dealRows = await db.query<{ id: string; name: string | null; advertiser: string | null; end_date: string | null }>(
    `SELECT d.id, d.name, pr.advertiser_name AS advertiser, to_char(d.end_date, 'YYYY-MM-DD') AS end_date
     FROM deals d LEFT JOIN programs pr ON pr.campaign_id = d.campaign_id
     ORDER BY d.end_date DESC NULLS LAST LIMIT 20`,
  );

  return {
    generatedAt,
    currency: opts.currency,
    persona,
    totals: {
      clicks: totalClicks,
      actions: totalActions,
      revenue: approvedValue,
      payout: num(totalRow?.payout),
      epc: epc(approvedValue, totalClicks),
      conversionRate: conversionRate(totalActions, totalClicks),
      pendingValue: num(totalRow?.pending_value),
      approvedValue,
      reversedValue: num(totalRow?.reversed_value),
      reversalRate: reversalRate(num(totalRow?.reversed_ct), totalActions),
    },
    actionsByState,
    dailyTrend: trendRows.map((r) => {
      const clicks = num(r.clicks);
      const revenue = num(r.revenue);
      return { day: r.day, clicks, actions: num(r.actions), revenue, epc: epc(revenue, clicks) };
    }),
    topPartners,
    topPrograms,
    bySubId,
    topCatalogItems: catalogRows.map((r) => ({
      id: r.catalog_item_id,
      name: r.name,
      category: r.category,
      price: r.current_price != null ? num(r.current_price) : null,
    })),
    properties: propertyRows,
    deals: dealRows.map((r) => ({ id: r.id, name: r.name, advertiser: r.advertiser, endDate: r.end_date })),
  };
}
