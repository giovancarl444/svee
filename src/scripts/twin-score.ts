/**
 * `npm run twin:score` — score listings without touching the DB or drafting.
 * The "dry-run in stage-only mode for a week; read the digests; tune the weights"
 * workflow: pass URLs or a --input <file.json> of RawListing[] and inspect the
 * fit breakdown + hard filters.
 */
import { readFileSync } from "node:fs";
import { loadEnvFiles } from "../util/env.js";
import { loadTwinConfig } from "../twin/config.js";
import { loadKb } from "../twin/kb.js";
import { scoreRole } from "../twin/scoring.js";
import { parseListing } from "../twin/sources/parse.js";
import type { RawListing } from "../twin/sources/types.js";

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main() {
  loadEnvFiles();
  const argv = process.argv.slice(2);
  const config = loadTwinConfig({ argv });
  const { kb } = loadKb(config.kbPath);

  const listings: RawListing[] = [];
  for (const a of argv) if (/^https?:\/\//i.test(a)) listings.push({ url: a, source: "pasted" });
  const inputFile = flagValue(argv, "--input");
  if (inputFile) listings.push(...(JSON.parse(readFileSync(inputFile, "utf8")) as RawListing[]));

  if (!listings.length) {
    console.error("Nothing to score. Pass a URL or --input <file.json> of RawListing[].");
    process.exit(1);
  }

  const results = listings.map((l) => {
    const facts = parseListing(l);
    const result = scoreRole(facts, kb, {
      threshold: config.threshold,
      weights: config.weights,
      salaryFloor: config.salaryFloor,
    });
    return {
      company: facts.company,
      role: facts.role,
      score: result.score,
      tier: result.tier,
      pass: result.pass,
      hardFilter: result.hardFilter,
      matchedSkills: result.matchedSkills,
      breakdown: result.breakdown,
      reasons: result.reasons,
    };
  });

  console.log(JSON.stringify({ threshold: config.threshold, results }, null, 2));
}

main();
