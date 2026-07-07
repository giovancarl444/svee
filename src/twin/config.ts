/**
 * SVEE//TWIN configuration. Loaded from the environment (via .env.local in dev),
 * validated with zod, and resolved into the knobs that do the most work: the fit
 * THRESHOLD, the SALARY_FLOOR, the scoring weights, and the live/stage-only gate.
 *
 * Nothing in the twin reads process.env directly — everything flows through
 * `loadTwinConfig()`. This mirrors the impact.com layer's config discipline so
 * the two subsystems share one operational model (same .env.local, same DB).
 */
import { z } from "zod";
import { DEFAULT_WEIGHTS, type ScoringWeights } from "./scoring.js";

export interface TwinConfig {
  /** Discard anything below this fit score. Default 68 (see SCORING rubric). */
  threshold: number;
  /** Rubric weights (sum ~100). Tunable via env, defaults per the spec. */
  weights: ScoringWeights;
  /**
   * Hard salary floor in the KB's own unit (Svee uses monthly SEK unless the KB
   * says otherwise). null = unknown → comp is scored neutrally, never discarded.
   */
  salaryFloor: number | null;
  /**
   * The whole safety model in one flag. false (default) = STAGE-ONLY: the twin
   * does 100% of the work and queues every hard-stop for human approval, and the
   * executor refuses to perform final actions. true only ever authorizes an
   * *approved* action to be handed off — it never bypasses an approval row.
   */
  live: boolean;
  /** Cap on how many applications we stage per run (anti spray-and-pray). */
  maxStagedPerRun: number;
  /** Model for the tailoring/drafting LLM. Default: the latest Opus. */
  model: string;
  /** Anthropic key for the live drafting path. Absent → deterministic dry-run. */
  anthropicApiKey: string | undefined;
  /** Optional external KB JSON file. Absent → the bundled kb.data.ts is used. */
  kbPath: string | undefined;
  /** Follow-up nudge delay for high-fit, no-reply applications (days). */
  followUpAfterDays: number;
  /** Which of Svee's mailboxes email applications/replies are staged for. */
  emailProvider: "gmail" | "outlook";
  /** Default channel for recruiter messages/follow-ups (reply-on-same-channel wins). */
  messageChannel: "email" | "linkedin" | "whatsapp";
  db: {
    driver: "supabase" | "postgres" | "none";
    url: string | undefined;
    /** Optional RAW password (avoids URL percent-encoding), same as the sync layer. */
    password: string | undefined;
  };
}

const numberFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v === "" ? fallback : Number(v)))
    .pipe(z.number().finite());

const optionalNumber = () =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? null : Number(v)))
    .pipe(z.number().finite().nullable());

const EnvSchema = z.object({
  TWIN_THRESHOLD: numberFromEnv(68),
  TWIN_SALARY_FLOOR: optionalNumber(),
  TWIN_LIVE: z.string().optional().default("0"),
  TWIN_MAX_STAGED: numberFromEnv(8),
  TWIN_MODEL: z.string().optional().default("claude-opus-4-8"),
  TWIN_FOLLOWUP_DAYS: numberFromEnv(7),
  ANTHROPIC_API_KEY: z.string().optional(),
  TWIN_KB_PATH: z.string().optional(),
  TWIN_EMAIL_PROVIDER: z.enum(["gmail", "outlook"]).optional().default("gmail"),
  TWIN_MESSAGE_CHANNEL: z.enum(["email", "linkedin", "whatsapp"]).optional().default("email"),

  // Per-weight overrides (all optional; default to the rubric).
  TWIN_W_SKILLS: numberFromEnv(DEFAULT_WEIGHTS.skills),
  TWIN_W_ROLE_FAMILY: numberFromEnv(DEFAULT_WEIGHTS.roleFamily),
  TWIN_W_SENIORITY: numberFromEnv(DEFAULT_WEIGHTS.seniority),
  TWIN_W_COMP: numberFromEnv(DEFAULT_WEIGHTS.comp),
  TWIN_W_WORK_MODE: numberFromEnv(DEFAULT_WEIGHTS.workMode),
  TWIN_W_COMPANY: numberFromEnv(DEFAULT_WEIGHTS.company),
  TWIN_W_EFFORT: numberFromEnv(DEFAULT_WEIGHTS.effort),

  // Shared warehouse — same variables the sync layer uses.
  DB: z.enum(["supabase", "postgres", "none"]).optional().default("none"),
  DATABASE_URL: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
});

export interface LoadTwinConfigOptions {
  env?: NodeJS.ProcessEnv;
  argv?: string[];
}

/**
 * Tolerate a GitHub-Actions foot-gun where a *Variable* is saved with its whole
 * `KEY=value` line as the value (so `DB` arrives as `"DB=supabase"`). Strip a
 * leading `<KEY>=` when a value redundantly repeats its own key. Copied in spirit
 * from the sync config so both subsystems behave identically in CI.
 */
function normalizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) {
    out[k] = typeof v === "string" && v.startsWith(`${k}=`) ? v.slice(k.length + 1) : v;
  }
  return out;
}

/** Resolve the live gate. Precedence: `--live` CLI flag > TWIN_LIVE env > dry. */
function resolveLive(env: NodeJS.ProcessEnv, argv: string[]): boolean {
  if (argv.includes("--live")) return true;
  if (argv.includes("--stage-only") || argv.includes("--dry-run")) return false;
  const v = (env.TWIN_LIVE ?? "0").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function loadTwinConfig(opts: LoadTwinConfigOptions = {}): TwinConfig {
  const env = normalizeEnv(opts.env ?? process.env);
  const argv = opts.argv ?? process.argv.slice(2);
  const p = EnvSchema.parse(env);

  return {
    threshold: p.TWIN_THRESHOLD,
    weights: {
      skills: p.TWIN_W_SKILLS,
      roleFamily: p.TWIN_W_ROLE_FAMILY,
      seniority: p.TWIN_W_SENIORITY,
      comp: p.TWIN_W_COMP,
      workMode: p.TWIN_W_WORK_MODE,
      company: p.TWIN_W_COMPANY,
      effort: p.TWIN_W_EFFORT,
    },
    salaryFloor: p.TWIN_SALARY_FLOOR,
    live: resolveLive(env, argv),
    maxStagedPerRun: p.TWIN_MAX_STAGED,
    model: p.TWIN_MODEL,
    anthropicApiKey: p.ANTHROPIC_API_KEY?.trim() || undefined,
    kbPath: p.TWIN_KB_PATH?.trim() || undefined,
    followUpAfterDays: p.TWIN_FOLLOWUP_DAYS,
    emailProvider: p.TWIN_EMAIL_PROVIDER,
    messageChannel: p.TWIN_MESSAGE_CHANNEL,
    db: {
      driver: p.DB,
      url: p.DATABASE_URL,
      password: p.DATABASE_PASSWORD,
    },
  };
}
