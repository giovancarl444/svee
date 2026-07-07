/**
 * Vercel serverless function — live dashboard metrics from the warehouse.
 * GET /api/metrics -> the same DashboardMetrics JSON the static snapshot holds,
 * computed on demand from Supabase/Postgres and CDN-cached briefly.
 *
 * Imports the COMPILED library from ../dist (Vercel runs `npm run build` first,
 * per vercel.json), so the ESM `.js` specifiers resolve at runtime.
 *
 * Env required on Vercel: DB=supabase, DATABASE_URL (use the Supabase
 * *transaction pooler* string for serverless), IMPACT_PERSONA, DEFAULT_CURRENCY.
 */
import { loadConfig } from "../dist/client/config.js";
import { createDatabase } from "../dist/sync/db.js";
import { computeDashboardMetrics } from "../dist/sync/metrics.js";

export default async function handler(_req: unknown, res: any): Promise<void> {
  try {
    const config = loadConfig();
    if (config.db.driver === "none") {
      res.status(500).json({ error: "DB not configured (set DB + DATABASE_URL)" });
      return;
    }
    const db = createDatabase(config);
    try {
      const metrics = await computeDashboardMetrics(db, {
        currency: config.defaultCurrency,
        persona: config.persona,
      });
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "s-maxage=300, stale-while-revalidate=600");
      res.status(200).json(metrics);
    } finally {
      await db.close();
    }
  } catch (err) {
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
}
