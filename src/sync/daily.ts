/**
 * Derive daily_performance from the synced actions + clicks, instead of
 * depending on impact.com's report-export engine (which can 500 on custom
 * reports). This is self-sufficient: once actions/clicks are synced, the daily
 * trend is always available.
 *
 * Revenue/payout count only APPROVED actions (see ACTION_STATE); if the live
 * status vocabulary differs, adjust ACTION_STATE and re-run — this picks it up.
 */
import type { Database } from "./db.js";
import { ACTION_STATE } from "../types/impact.js";

export async function rebuildDailyPerformance(db: Database): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `WITH agg AS (
       SELECT day, media_id, campaign_id,
              sum(clicks)::bigint AS clicks, sum(actions)::bigint AS actions,
              sum(revenue) AS revenue, sum(payout) AS payout
       FROM (
         SELECT date(event_date) AS day,
                coalesce(media_id, '') AS media_id, coalesce(campaign_id, '') AS campaign_id,
                1 AS clicks, 0 AS actions, 0::numeric AS revenue, 0::numeric AS payout
         FROM clicks WHERE event_date IS NOT NULL
         UNION ALL
         SELECT date(event_date),
                coalesce(media_id, ''), coalesce(campaign_id, ''),
                0, 1,
                CASE WHEN state = $1 THEN coalesce(amount, 0) ELSE 0 END,
                CASE WHEN state = $1 THEN coalesce(payout, 0) ELSE 0 END
         FROM actions WHERE event_date IS NOT NULL
       ) u
       GROUP BY day, media_id, campaign_id
     ), up AS (
       INSERT INTO daily_performance (day, media_id, campaign_id, clicks, actions, revenue, payout, raw)
       SELECT day, media_id, campaign_id, clicks, actions, revenue, payout, '{}'::jsonb FROM agg
       ON CONFLICT (day, media_id, campaign_id) DO UPDATE SET
         clicks = EXCLUDED.clicks, actions = EXCLUDED.actions,
         revenue = EXCLUDED.revenue, payout = EXCLUDED.payout, synced_at = now()
       RETURNING 1
     )
     SELECT count(*)::int AS n FROM up`,
    [ACTION_STATE.approved],
  );
  return rows[0]?.n ?? 0;
}
