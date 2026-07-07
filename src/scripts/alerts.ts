/**
 * `npm run alerts` — evaluate partner EPC drops / reversal spikes from the
 * warehouse. Prints alerts as JSON lines; exit code 1 if any critical alert.
 */
import { loadEnvFiles } from "../util/env.js";
import { loadConfig } from "../client/config.js";
import { createDatabase } from "../sync/db.js";
import { computeAlerts } from "../automation/alerts.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  loadEnvFiles();
  const config = loadConfig();
  if (config.db.driver === "none") {
    console.error("DB=none — nothing to evaluate. Set DB + DATABASE_URL and run `npm run sync` first.");
    process.exit(1);
  }
  const db = createDatabase(config);
  try {
    const alerts = await computeAlerts(db, { recentDays: arg("days") ? Number(arg("days")) : 7 });
    if (!alerts.length) {
      console.log("✅ No alerts.");
      return;
    }
    for (const a of alerts) {
      console.log(`${a.severity === "critical" ? "🔴" : "🟠"} [${a.kind}] ${a.name ?? a.mediaId}: ${a.message}`);
    }
    console.log(`\n${alerts.length} alert(s).`);
    if (alerts.some((a) => a.severity === "critical")) process.exit(1);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
