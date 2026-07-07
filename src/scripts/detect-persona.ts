/**
 * `npm run persona` — auto-detect the account's persona (§2).
 * Probes Campaigns under each base path; exactly one should return 200.
 */
import { loadEnvFiles } from "../util/env.js";
import { loadConfig, hasCredentials } from "../client/config.js";
import { ImpactClient } from "../client/impact-client.js";
import { isImpactError } from "../client/errors.js";
import { CREDENTIAL_HELP } from "./help.js";

async function main() {
  loadEnvFiles();
  const config = loadConfig();
  if (!hasCredentials(config)) {
    console.error(CREDENTIAL_HELP);
    process.exit(1);
  }

  const client = new ImpactClient(config);
  console.log(`Configured persona: ${config.persona}   Host: ${config.apiHost}`);
  console.log(`Identity: ${client.http.describeIdentity()}\n`);

  try {
    const result = await client.detectPersona();
    console.log("Probe results:");
    for (const p of result.probes) {
      const mark = p.ok ? "✅ 200" : `   ${p.status}${p.detail ? ` (${p.detail})` : ""}`;
      console.log(`  ${mark.padEnd(18)} ${p.persona.padEnd(8)} ${p.path}`);
    }
    console.log("");
    if (result.detected) {
      console.log(`Detected persona: ${result.detected}`);
      if (!result.matchesConfig) {
        console.warn(
          `⚠️  Detected persona (${result.detected}) does NOT match IMPACT_PERSONA (${result.configured}). ` +
            `Update IMPACT_PERSONA in .env.local to "${result.detected}".`,
        );
        process.exit(2);
      }
      console.log("✅ Detected persona matches configuration.");
    } else if (result.ambiguous) {
      console.error("❌ Ambiguous: more than one base path returned 200. Investigate credentials/scope.");
      process.exit(3);
    } else {
      console.error("❌ No base path returned 200. Check credentials (401) or account scope (403).");
      process.exit(4);
    }
  } catch (err) {
    if (isImpactError(err)) {
      console.error(`❌ ${err.kind}: ${err.message}`);
    } else {
      console.error("❌ Unexpected error:", err);
    }
    process.exit(1);
  }
}

main();
