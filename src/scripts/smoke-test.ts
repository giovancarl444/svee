/**
 * `npm run smoke` — Phase 1 acceptance:
 *   - authenticated GET Campaigns (200)
 *   - last-30-day performance report (row count)
 *   - list partners (brand) / programs (partner) (row count)
 *   - list recent actions (row count)
 *
 * Every step is wrapped so one failure doesn't abort the rest, and the output
 * is a compact pass/fail so it doubles as a health check.
 */
import { loadEnvFiles } from "../util/env.js";
import { loadConfig, hasCredentials } from "../client/config.js";
import { ImpactClient } from "../client/impact-client.js";
import { lastNDays } from "../util/date.js";
import { CREDENTIAL_HELP } from "./help.js";

async function step<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  const started = Date.now();
  try {
    const out = await fn();
    console.log(`  ✅ ${label}  (${Date.now() - started}ms)`);
    return out;
  } catch (err) {
    console.log(`  ❌ ${label}  → ${(err as Error).message}`);
    return undefined;
  }
}

async function main() {
  loadEnvFiles();
  const config = loadConfig();
  if (!hasCredentials(config)) {
    console.error(CREDENTIAL_HELP);
    process.exit(1);
  }

  const client = new ImpactClient(config);
  console.log(`\nimpact.com smoke test — persona=${config.persona} host=${config.apiHost}`);
  console.log(`Identity: ${client.http.describeIdentity()}\n`);

  const smoke = await step("auth GET Campaigns", () => client.smoke());
  if (smoke) console.log(`     → HTTP ${smoke.status}`);

  await step("last-30-day performance report", async () => {
    const rows = await client.reports.performance({ days: 30 });
    console.log(`     → ${rows.length} report rows`);
  });

  if (config.persona === "partner") {
    await step("list programs", async () => {
      const programs = await client.programs.list();
      console.log(`     → ${programs.length} programs`);
    });
  } else {
    await step("list media partners", async () => {
      const partners = await client.partners.list();
      console.log(`     → ${partners.length} partners`);
    });
  }

  await step("list recent actions (30d)", async () => {
    const range = lastNDays(30);
    const actions = await client.actions.list({ startDate: range.start, pageSize: 100 }, 500);
    console.log(`     → ${actions.length} actions (capped at 500)`);
  });

  console.log("\nSmoke test complete.\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
