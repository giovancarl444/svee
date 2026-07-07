/**
 * `npm run backfill -- --days 90` (or `--from 2025-01-01 --to 2025-06-30`).
 * Idempotent historical load of actions + clicks.
 */
import { loadEnvFiles } from "../util/env.js";
import { loadConfig, hasCredentials } from "../client/config.js";
import { ImpactClient } from "../client/impact-client.js";
import { createDatabase } from "../sync/db.js";
import { runBackfill, backfillLastNDays } from "../sync/backfill.js";
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
  const windowDays = arg("window") ? Number(arg("window")) : undefined;

  try {
    const daysArg = arg("days");
    let summary;
    if (daysArg) {
      summary = await backfillLastNDays(client, db, Number(daysArg), windowDays ? { windowDays } : {});
    } else {
      const from = arg("from");
      if (!from) {
        console.error("Provide --days N, or --from YYYY-MM-DD [--to YYYY-MM-DD].");
        process.exit(2);
      }
      const to = arg("to");
      summary = await runBackfill(client, db, {
        from: new Date(from),
        ...(to ? { to: new Date(to) } : {}),
        ...(windowDays ? { windowDays } : {}),
      });
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
