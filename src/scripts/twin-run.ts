/**
 * `npm run twin:run` — the daily-loop entrypoint (cron + on-demand).
 *
 * Intake:
 *   - bare URL args           → pasted listings (highest priority)
 *   - --input <file.json>     → RawListing[] batch
 *   - --inbox <file.json>     → InboundMessage[] to classify/route
 * Modes:
 *   - stage-only (default)    → does 100% of the work, queues every hard-stop
 *   - --live                  → authorizes handoff of APPROVED actions only
 *
 * Emits one JSON TwinRunOutput on stdout and a human summary on stderr, and (when
 * a DB is configured) persists jobs/applications/messages/approvals/digest.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadEnvFiles } from "../util/env.js";
import { loadTwinConfig } from "../twin/config.js";
import { loadKb } from "../twin/kb.js";
import { createLlm } from "../twin/llm.js";
import { runTwin, type FollowupDue } from "../twin/loop.js";
import type { RawListing } from "../twin/sources/types.js";
import { boardSource, collectListings, buildFetcher } from "../twin/sources/index.js";
import type { InboundMessage } from "../twin/inbox.js";
import {
  createTwinDatabase,
  applyTwinSchema,
  applyPipelineWrites,
  insertApprovals,
  insertDigest,
  upsertKbSnapshot,
  liveApplicationKeys,
  previousDigestRunAt,
  countSubmittedSince,
  dueFollowups,
} from "../twin/store.js";

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

async function main() {
  loadEnvFiles();
  const argv = process.argv.slice(2);
  const config = loadTwinConfig({ argv });
  const { kb, missing } = loadKb(config.kbPath);
  const llm = createLlm(config);
  const now = new Date();

  // Intake.
  const listings: RawListing[] = [];
  for (const a of argv) {
    if (/^https?:\/\//i.test(a)) listings.push({ url: a, source: "pasted" });
  }
  const inputFile = flagValue(argv, "--input");
  if (inputFile) listings.push(...readJson<RawListing[]>(inputFile));
  // Automatic intake from watched ATS boards (public JSON). Opt-in so CI/offline
  // runs stay deterministic; a dead source never sinks the run (collectListings
  // isolates failures).
  if (argv.includes("--fetch")) {
    const adapters = kb.sources.map((s) => boardSource(s, buildFetcher(s)));
    listings.push(...(await collectListings(adapters)));
  }
  const inboxFile = flagValue(argv, "--inbox");
  const inbound: InboundMessage[] = inboxFile ? readJson<InboundMessage[]>(inboxFile) : [];

  // State (from the DB, if configured).
  let liveKeys = new Set<string>();
  let submittedPrevRun = 0;
  let followupsDue: FollowupDue[] = [];
  const db = createTwinDatabase(config);
  const hasDb = config.db.driver !== "none";

  try {
    if (hasDb) {
      await applyTwinSchema(db);
      await upsertKbSnapshot(db, kb.version, kb);
      liveKeys = await liveApplicationKeys(db);
      submittedPrevRun = await countSubmittedSince(db, await previousDigestRunAt(db));
      followupsDue = (await dueFollowups(db, now.toISOString())).map((f) => ({
        applicationId: f.applicationId,
        company: f.company,
        role: f.role,
        channel: f.channel,
        daysWaiting: f.daysWaiting,
      }));
    } else {
      console.error("⚠️  DB not configured (DB=none) — running stage-only, nothing persisted.");
    }

    const output = await runTwin({
      kb,
      missingSlots: missing,
      config,
      listings,
      inbound,
      state: { liveApplicationKeys: liveKeys, submittedPrevRun, followupsDue },
      llm,
      now,
    });

    if (hasDb) {
      await applyPipelineWrites(db, output.pipeline_writes);
      await insertApprovals(db, output.approval_requests);
      await insertDigest(db, randomUUID(), output.digest);
    }

    // Machine-readable contract on stdout.
    console.log(JSON.stringify(output, null, 2));

    // Human summary on stderr.
    const d = output.digest;
    console.error(
      `\nTwin run ${config.live ? "(LIVE)" : "(stage-only)"} — found ${d.found}, scored ${d.scored}, ` +
        `passed ${d.passed_threshold}, staged ${d.staged}, discarded ${d.discarded_low_fit}. ` +
        `${output.approval_requests.length} approval(s), ${output.cortex_alerts.length} alert(s).`,
    );
    if (d.needs_decision.length) {
      console.error("Needs decision:");
      for (const n of d.needs_decision) console.error(`  • ${n}`);
    }
    const critical = output.cortex_alerts.filter((a) => a.priority !== "normal");
    for (const a of critical) console.error(`  ⚑ [${a.priority}] ${a.kind}: ${a.company} — ${a.summary}`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
