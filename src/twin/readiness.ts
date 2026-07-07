/**
 * Engine readiness — the concrete answer to "is everything ready?". A pure,
 * testable rollup of every precondition to reach out for real: KB completeness,
 * config, DB, channels, drafting, and the Sphere wiring. `twin:doctor` renders it.
 *
 * The go-live gate is intentionally strict: the twin can do 100% of the *work* in
 * stage-only mode, but "reaching out for real" needs a filled KB, a DB to persist
 * the queue, and a real Sphere executor wired to perform approved actions.
 */
import type { TwinConfig } from "./config.js";
import type { KnowledgeBase } from "./kb.schema.js";
import { channelReadiness } from "./channels.js";

export interface ReadinessSection {
  name: string;
  ok: boolean;
  detail: string;
  /** Present when this section blocks reaching out for real. */
  blocker?: string;
}

export interface ReadinessReport {
  /** True only when every go-live precondition is met. */
  ready: boolean;
  sections: ReadinessSection[];
  blockers: string[];
}

export interface ReadinessInput {
  kb: KnowledgeBase;
  missing: string[];
  config: TwinConfig;
  dbConnected: boolean;
  /** Whether a real SphereExecutor is wired (StagingSphere ⇒ false). */
  sphereWired: boolean;
}

export function buildReadiness(input: ReadinessInput): ReadinessReport {
  const { kb, missing, config, dbConnected, sphereWired } = input;
  const sections: ReadinessSection[] = [];

  // Knowledge Base — every fact filled?
  sections.push(
    missing.length === 0
      ? { name: "Knowledge Base", ok: true, detail: `v${kb.version} — all facts filled` }
      : {
          name: "Knowledge Base",
          ok: false,
          detail: `v${kb.version} — ${missing.length} unfilled slot(s): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? " …" : ""}`,
          blocker: `Fill ${missing.length} KB slot(s) (src/twin/kb.data.ts or TWIN_KB_PATH)`,
        },
  );

  // Config — the knobs that gate quality/safety.
  const floor = config.salaryFloor == null ? "unset (comp scored neutrally)" : String(config.salaryFloor);
  sections.push({
    name: "Config",
    ok: true,
    detail: `threshold ${config.threshold} · salary floor ${floor} · email ${config.emailProvider} · messages ${config.messageChannel} · mode ${config.live ? "LIVE" : "stage-only"}`,
  });

  // Database — needed to persist the queue and dedupe.
  sections.push(
    dbConnected
      ? { name: "Database", ok: true, detail: `${config.db.driver} connected` }
      : {
          name: "Database",
          ok: false,
          detail: "no DB configured (DB=none)",
          blocker: "Set DB=supabase|postgres + DATABASE_URL to persist the pipeline",
        },
  );

  // Channels — always prepared to the last click.
  const chans = channelReadiness();
  sections.push({
    name: "Channels",
    ok: true,
    detail: `${chans.length} prepared (${chans.filter((c) => c.layer === "application").length} application, ${chans.filter((c) => c.layer === "message").length} message)`,
  });

  // LLM drafting — optional (deterministic KB-bound path otherwise).
  sections.push({
    name: "LLM drafting",
    ok: true,
    detail: config.anthropicApiKey
      ? `live (${config.model})`
      : "deterministic KB-bound (set ANTHROPIC_API_KEY + install @anthropic-ai/sdk for live)",
  });

  // Sphere — the credentialed executor that performs approved final actions.
  sections.push(
    sphereWired
      ? { name: "Sphere executor", ok: true, detail: "real SphereExecutor wired" }
      : {
          name: "Sphere executor",
          ok: false,
          detail: "StagingSphere (inert — no credentials, never sends)",
          blocker: "Wire a real SphereExecutor to perform approved actions (see sphere.ts)",
        },
  );

  const blockers = sections.filter((s) => s.blocker).map((s) => s.blocker!);
  return { ready: blockers.length === 0, sections, blockers };
}
