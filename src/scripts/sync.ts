/**
 * `npm run sync` — incremental pull → idempotent upsert into the warehouse.
 * Re-running is a no-op on unchanged data. Intended as the cron entrypoint.
 */
import { loadEnvFiles } from "../util/env.js";
import { loadConfig, hasCredentials } from "../client/config.js";
import { ImpactClient } from "../client/impact-client.js";
import { createDatabase } from "../sync/db.js";
import { runSync } from "../sync/sync.js";
import { CREDENTIAL_HELP } from "./help.js";

async function main() {
  loadEnvFiles();
  const config = loadConfig();
  if (!hasCredentials(config)) {
    console.error(CREDENTIAL_HELP);
    process.exit(1);
  }
  const client = new ImpactClient(config);
  const db = createDatabase(config);
  try {
    const summary = await runSync(client, db);
    const failed = summary.stages.filter((s) => !s.ok);
    console.log(JSON.stringify(summary, null, 2));
    console.log(
      `\nSync ${failed.length ? "completed WITH ERRORS" : "OK"} — ` +
        summary.stages.map((s) => `${s.stage}:${s.ok ? s.upserted : "ERR"}`).join("  "),
    );
    process.exit(failed.length ? 1 : 0);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
