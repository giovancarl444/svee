/**
 * `npm run twin:migrate` — apply the twin pipeline schema and snapshot the KB.
 * Idempotent; also auto-applied on the first `npm run twin:run`.
 */
import { loadEnvFiles } from "../util/env.js";
import { loadTwinConfig } from "../twin/config.js";
import { loadKb } from "../twin/kb.js";
import { createTwinDatabase, applyTwinSchema, upsertKbSnapshot } from "../twin/store.js";

async function main() {
  loadEnvFiles();
  const config = loadTwinConfig();
  if (config.db.driver === "none") {
    console.error(
      "DB not configured. Set DB=supabase|postgres and DATABASE_URL in .env.local, then re-run.",
    );
    process.exit(1);
  }
  const db = createTwinDatabase(config);
  try {
    await applyTwinSchema(db);
    const { kb, missing } = loadKb(config.kbPath);
    await upsertKbSnapshot(db, kb.version, kb);
    console.log(`Twin schema applied. KB v${kb.version} snapshotted (${missing.length} slot(s) unfilled).`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
