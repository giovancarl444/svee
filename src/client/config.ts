/**
 * Central configuration. Loads from environment (via .env.local in dev),
 * validates with zod, and resolves derived settings like version pinning and
 * the dry-run/live write gate. Nothing else in the codebase reads process.env
 * directly — everything flows through `loadConfig()`.
 */
import { z } from "zod";
import { isPersona, type Persona } from "./persona.js";
import type { LogLevel } from "./logger.js";

/** How the pinned API version is applied to a request. VERIFY against docs. */
export type VersionStrategy = "none" | "header" | "path";

export interface ImpactConfig {
  accountSid: string;
  authToken: string;
  persona: Persona;
  apiHost: string;

  /** Per-persona pinned version numbers. */
  versions: { brand: string; partner: string; agency: string };
  versionStrategy: VersionStrategy;
  versionHeader: string;

  defaultCurrency: string;
  defaultTimezone: string;
  regionCompliance: string;

  http: {
    timeoutMs: number;
    maxRetries: number;
    backoffBaseMs: number;
    backoffMaxMs: number;
    /** Upper bound on how long a server `Retry-After` may block us. */
    retryAfterMaxMs: number;
  };
  logLevel: LogLevel;

  deferred: { pollIntervalMs: number; maxWaitMs: number };

  /** true = writes actually fire; false = dry-run (log the request only). */
  live: boolean;

  db: {
    driver: "supabase" | "postgres" | "sqlite" | "none";
    url: string | undefined;
    supabaseUrl: string | undefined;
    supabaseServiceRoleKey: string | undefined;
    sqlitePath: string;
    retentionDays: number;
  };

  webhook: { signingSecret: string | undefined; port: number };
}

const numberFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v === "" ? fallback : Number(v)))
    .pipe(z.number().finite());

const EnvSchema = z.object({
  IMPACT_ACCOUNT_SID: z.string().optional().default(""),
  IMPACT_AUTH_TOKEN: z.string().optional().default(""),
  IMPACT_PERSONA: z.string().optional().default("partner"),
  IMPACT_API_HOST: z.string().optional().default("https://api.impact.com"),

  IMPACT_BRAND_VERSION: z.string().optional().default("14"),
  IMPACT_PARTNER_VERSION: z.string().optional().default("16"),
  IMPACT_AGENCY_VERSION: z.string().optional().default("3"),
  IMPACT_VERSION_STRATEGY: z.enum(["none", "header", "path"]).optional().default("none"),
  IMPACT_VERSION_HEADER: z.string().optional().default("X-Api-Version"),

  DEFAULT_CURRENCY: z.string().optional().default("SEK"),
  DEFAULT_TIMEZONE: z.string().optional().default("Europe/Stockholm"),
  REGION_COMPLIANCE: z.string().optional().default("EU_GDPR"),

  HTTP_TIMEOUT_MS: numberFromEnv(30_000),
  HTTP_MAX_RETRIES: numberFromEnv(5),
  HTTP_BACKOFF_BASE_MS: numberFromEnv(500),
  HTTP_BACKOFF_MAX_MS: numberFromEnv(20_000),
  HTTP_RETRY_AFTER_MAX_MS: numberFromEnv(60_000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),

  DEFERRED_POLL_INTERVAL_MS: numberFromEnv(2_000),
  DEFERRED_MAX_WAIT_MS: numberFromEnv(300_000),

  IMPACT_LIVE: z.string().optional().default("0"),

  DB: z.enum(["supabase", "postgres", "sqlite", "none"]).optional().default("none"),
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SQLITE_PATH: z.string().optional().default("./data/impact.sqlite"),
  DATA_RETENTION_DAYS: numberFromEnv(395),

  WEBHOOK_SIGNING_SECRET: z.string().optional(),
  WEBHOOK_PORT: numberFromEnv(8787),
});

export interface LoadConfigOptions {
  /** Extra env overrides (mostly for tests). */
  env?: NodeJS.ProcessEnv;
  /** CLI argv to scan for `--live`. Defaults to process.argv. */
  argv?: string[];
}

/**
 * Resolve the live/dry-run gate. A write only fires when explicitly opted in.
 * Precedence: `--live` CLI flag wins; otherwise IMPACT_LIVE env; default dry.
 */
function resolveLive(env: NodeJS.ProcessEnv, argv: string[]): boolean {
  if (argv.includes("--live")) return true;
  if (argv.includes("--dry-run")) return false;
  const v = (env.IMPACT_LIVE ?? "0").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function loadConfig(opts: LoadConfigOptions = {}): ImpactConfig {
  const env = opts.env ?? process.env;
  const argv = opts.argv ?? process.argv.slice(2);
  const parsed = EnvSchema.parse(env);

  const personaRaw = parsed.IMPACT_PERSONA.trim().toLowerCase();
  if (!isPersona(personaRaw)) {
    throw new Error(`IMPACT_PERSONA must be one of brand|partner|agency, got "${parsed.IMPACT_PERSONA}".`);
  }

  return {
    accountSid: parsed.IMPACT_ACCOUNT_SID.trim(),
    authToken: parsed.IMPACT_AUTH_TOKEN.trim(),
    persona: personaRaw,
    apiHost: parsed.IMPACT_API_HOST.replace(/\/+$/, ""),
    versions: {
      brand: parsed.IMPACT_BRAND_VERSION,
      partner: parsed.IMPACT_PARTNER_VERSION,
      agency: parsed.IMPACT_AGENCY_VERSION,
    },
    versionStrategy: parsed.IMPACT_VERSION_STRATEGY,
    versionHeader: parsed.IMPACT_VERSION_HEADER,
    defaultCurrency: parsed.DEFAULT_CURRENCY,
    defaultTimezone: parsed.DEFAULT_TIMEZONE,
    regionCompliance: parsed.REGION_COMPLIANCE,
    http: {
      timeoutMs: parsed.HTTP_TIMEOUT_MS,
      maxRetries: parsed.HTTP_MAX_RETRIES,
      backoffBaseMs: parsed.HTTP_BACKOFF_BASE_MS,
      backoffMaxMs: parsed.HTTP_BACKOFF_MAX_MS,
      retryAfterMaxMs: parsed.HTTP_RETRY_AFTER_MAX_MS,
    },
    logLevel: parsed.LOG_LEVEL,
    deferred: {
      pollIntervalMs: parsed.DEFERRED_POLL_INTERVAL_MS,
      maxWaitMs: parsed.DEFERRED_MAX_WAIT_MS,
    },
    live: resolveLive(env, argv),
    db: {
      driver: parsed.DB,
      url: parsed.DATABASE_URL,
      supabaseUrl: parsed.SUPABASE_URL,
      supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
      sqlitePath: parsed.SQLITE_PATH,
      retentionDays: parsed.DATA_RETENTION_DAYS,
    },
    webhook: {
      signingSecret: parsed.WEBHOOK_SIGNING_SECRET,
      port: parsed.WEBHOOK_PORT,
    },
  };
}

/** The pinned version string for the active persona. */
export function activeVersion(config: ImpactConfig): string {
  return config.versions[config.persona];
}

/** Throw a clear, actionable error if credentials are absent. */
export function requireCredentials(config: ImpactConfig): void {
  const missing: string[] = [];
  if (!config.accountSid) missing.push("IMPACT_ACCOUNT_SID");
  if (!config.authToken) missing.push("IMPACT_AUTH_TOKEN");
  if (missing.length) {
    throw new Error(
      `Missing credentials: ${missing.join(", ")}. ` +
        `Paste them into .env.local (see .env.local.example) — the client cannot make live calls without them.`,
    );
  }
}

export function hasCredentials(config: ImpactConfig): boolean {
  return Boolean(config.accountSid && config.authToken);
}
