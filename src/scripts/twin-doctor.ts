/**
 * `npm run twin:doctor` — engine readiness check. Reports what's ready and what's
 * blocking "reaching out for real": KB completeness, config, DB, channels,
 * drafting, and the Sphere wiring. Exits non-zero if any go-live blocker remains.
 */
import { loadEnvFiles } from "../util/env.js";
import { loadTwinConfig } from "../twin/config.js";
import { loadKb } from "../twin/kb.js";
import { buildReadiness } from "../twin/readiness.js";
import { createTwinDatabase } from "../twin/store.js";

async function dbConnected(config: ReturnType<typeof loadTwinConfig>): Promise<boolean> {
  if (config.db.driver === "none") return false;
  const db = createTwinDatabase(config);
  try {
    await db.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await db.close();
  }
}

async function main() {
  loadEnvFiles();
  const config = loadTwinConfig();
  const { kb, missing } = loadKb(config.kbPath);
  const connected = await dbConnected(config);

  // Sphere is inert (StagingSphere) until the engine wires a real SphereExecutor.
  const report = buildReadiness({ kb, missing, config, dbConnected: connected, sphereWired: false });

  console.log(`SVEE//TWIN readiness — ${report.ready ? "READY ✅" : "NOT READY ⛔"}\n`);
  for (const s of report.sections) {
    console.log(`${s.ok ? "✅" : "⛔"} ${s.name.padEnd(16)} ${s.detail}`);
  }
  if (report.blockers.length) {
    console.log("\nTo reach out for real, resolve:");
    for (const b of report.blockers) console.log(`  • ${b}`);
  }
  process.exit(report.ready ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
