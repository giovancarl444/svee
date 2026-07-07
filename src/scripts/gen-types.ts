/**
 * `npm run gen:types` — generate `src/types/generated.ts` from the persona's
 * OpenAPI spec (the intended source of truth for models, per §4.3).
 *
 * This build could NOT run generation because egress to impact.com was blocked.
 * The script therefore (a) tells you the exact command to run once egress is
 * available, and (b) probes reachability so you know the moment it will work.
 */
import { loadEnvFiles } from "../util/env.js";
import { loadConfig } from "../client/config.js";

// Located via llms.txt / the reference readme. VERIFY the exact spec URLs.
const SPEC_HINTS: Record<string, string> = {
  brand: "https://integrations.impact.com/... (Brand API reference → OpenAPI spec)",
  partner: "https://integrations.impact.com/... (Partner API reference → OpenAPI spec)",
  agency: "https://integrations.impact.com/... (Agency v3 reference → OpenAPI spec)",
};

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  loadEnvFiles();
  const config = loadConfig();
  const specHint = SPEC_HINTS[config.persona];

  console.log(`\nType generation for persona: ${config.persona}`);
  console.log("Once egress to impact.com is available, generate typed models with:\n");
  console.log("  npx openapi-typescript <OPENAPI_SPEC_URL> -o src/types/generated.ts\n");
  console.log(`Locate <OPENAPI_SPEC_URL> via integrations.impact.com/llms.txt.`);
  console.log(`Hint for this persona: ${specHint}\n`);

  const canReach = await reachable("https://integrations.impact.com/llms.txt");
  if (canReach) {
    console.log("✅ integrations.impact.com is reachable — you can run the command above now.");
  } else {
    console.log(
      "❌ integrations.impact.com is NOT reachable from here (egress blocked). " +
        "Run gen:types from an environment allowed to reach impact.com.",
    );
  }
}

main();
