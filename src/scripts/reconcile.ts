/**
 * `npm run reconcile` — nightly API-vs-DB drift check. Exit code 1 on drift so
 * a cron can alert on it.
 */
import { loadEnvFiles } from "../util/env.js";
import { loadConfig, hasCredentials } from "../client/config.js";
import { ImpactClient } from "../client/impact-client.js";
import { createDatabase } from "../sync/db.js";
import { reconcileActions } from "../automation/reconcile.js";
import { CREDENTIAL_HELP } from "./help.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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
    const result = await reconcileActions(client, db, { days: arg("days") ? Number(arg("days")) : 7 });
    console.log(JSON.stringify(result, null, 2));
    console.log(result.ok ? "✅ Reconciliation OK — no drift." : "❌ Drift detected.");
    process.exit(result.ok ? 0 : 1);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
