/**
 * `npm run snapshot` — compute dashboard metrics from the warehouse and write
 * dashboard/public/metrics.json (gitignored). The static dashboard reads this,
 * so it renders live numbers with no backend. Run after `npm run sync`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadEnvFiles } from "../util/env.js";
import { loadConfig } from "../client/config.js";
import { createDatabase } from "../sync/db.js";
import { computeDashboardMetrics } from "../sync/metrics.js";

const OUT = "dashboard/public/metrics.json";

async function main() {
  loadEnvFiles();
  const config = loadConfig();
  if (config.db.driver === "none") {
    console.error("DB=none — nothing to snapshot. Set DB + DATABASE_URL and run `npm run sync` first.");
    process.exit(1);
  }
  const db = createDatabase(config);
  try {
    const metrics = await computeDashboardMetrics(db, { currency: config.defaultCurrency });
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(metrics, null, 2));
    console.log(`Wrote ${OUT}`);
    console.log(
      `totals: clicks=${metrics.totals.clicks} actions=${metrics.totals.actions} ` +
        `revenue=${metrics.totals.revenue.toFixed(2)} ${metrics.currency} ` +
        `EPC=${metrics.totals.epc.toFixed(3)} CR=${(metrics.totals.conversionRate * 100).toFixed(2)}%`,
    );
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
