/**
 * `npm run migrate` — apply schema.sql to the configured database (idempotent).
 * Standalone so you can create the tables before the first sync / before the
 * Vercel dashboard queries them. `npm run sync` also applies it automatically.
 */
import { loadEnvFiles } from "../util/env.js";
import { loadConfig } from "../client/config.js";
import { createDatabase, applySchema } from "../sync/db.js";

async function main() {
  loadEnvFiles();
  const config = loadConfig();
  if (config.db.driver === "none") {
    console.error("DB=none — set DB=supabase|postgres and DATABASE_URL in .env.local first.");
    process.exit(1);
  }
  const db = createDatabase(config);
  try {
    await applySchema(db);
    console.log(`✅ Schema applied to ${config.db.driver} (idempotent — safe to re-run).`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
