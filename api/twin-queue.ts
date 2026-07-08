/**
 * Vercel serverless function — the SVEE//TWIN Cortex view.
 * GET /api/twin-queue -> { digest, approvals } from the warehouse.
 *
 * READ-ONLY by design. Nothing here submits, logs in, or sends: it surfaces the
 * pending approval queue for a human to tap. The actual approval + final action
 * live in the Cortex engine (which flips twin_approvals.status and runs a thin
 * executor — see guardExecution in the library, which still refuses to submit).
 *
 * Imports the COMPILED library from ../dist (Vercel runs `npm run build` first).
 * Env required on Vercel: DB=supabase, DATABASE_URL (transaction pooler string).
 */
import { loadTwinConfig } from "../dist/twin/config.js";
import { createTwinDatabase, pendingApprovals, latestDigest } from "../dist/twin/store.js";

export default async function handler(_req: unknown, res: any): Promise<void> {
  try {
    const config = loadTwinConfig();
    if (config.db.driver === "none") {
      res.status(500).json({ error: "DB not configured (set DB + DATABASE_URL)" });
      return;
    }
    const db = createTwinDatabase(config);
    try {
      const [approvals, digest] = await Promise.all([pendingApprovals(db), latestDigest(db)]);
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "s-maxage=30, stale-while-revalidate=120");
      res.status(200).json({ digest, approvals });
    } finally {
      await db.close();
    }
  } catch (err) {
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
}
