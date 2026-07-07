import { z } from 'zod';

// Constraint §3: secrets never reach the browser. This package is imported by
// both the Next.js server runtime and the plain-Node workers, so we can't use
// the `server-only` package (it throws outside a React Server bundle). A window
// guard is the portable equivalent: importing this in a client bundle throws.
if (typeof (globalThis as { window?: unknown }).window !== 'undefined') {
  throw new Error('@cortex/config is server-only and must never be imported into a client bundle.');
}

/**
 * The env contract for CORTEX. Server-side only.
 *
 * Philosophy: the core must boot with a nearly-empty `.env` so Phase 0 runs
 * before any integration is configured. Only the datastore is required up front.
 * Everything else is optional here and validated *at the point of use* via the
 * `require*` helpers below, which throw a precise error naming the missing var.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORTEX_TZ: z.string().default('UTC'),
  CORTEX_BRIEF_HOUR: z.coerce.number().int().min(0).max(23).default(20),
  /** How often the scheduler runs an ingest→triage→escalate→loops cycle. */
  CORTEX_SYNC_INTERVAL_MIN: z.coerce.number().int().min(1).default(5),

  // Datastore — the one hard requirement.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Encryption at rest (Constraint §5). base64 of 32 bytes.
  CORTEX_ENCRYPTION_KEY: z.string().optional(),

  // Model provider (Constraint §4: the one configured provider is the only model
  // egress). 'anthropic' = pinned Claude tiers; 'openai' = any OpenAI-compatible
  // endpoint (local Ollama/Qwen3, or hosted DeepSeek/OpenRouter).
  CORTEX_MODEL_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  // OpenAI-compatible provider (used when CORTEX_MODEL_PROVIDER=openai).
  // e.g. http://localhost:11434/v1 (Ollama) or https://api.deepseek.com/v1.
  CORTEX_OPENAI_BASE_URL: z.string().optional(),
  // Bearer key for the endpoint above. Ollama ignores it; DeepSeek/OpenRouter need it.
  CORTEX_OPENAI_API_KEY: z.string().optional(),
  // Model IDs per tier. Defaults are the pinned Claude tiers; override to your
  // chosen model when using the openai provider (e.g. qwen3 / deepseek-chat).
  CORTEX_MODEL_TRIAGE: z.string().default('claude-haiku-4-5-20251001'),
  CORTEX_MODEL_ESCALATE: z.string().default('claude-sonnet-5'),
  CORTEX_MODEL_SYNTHESIS: z.string().default('claude-opus-4-8'),

  // Demo mode: register a synthetic, ground-truth-labeled inbox instead of any
  // real source adapter, so the whole pipeline runs with zero real accounts.
  CORTEX_DEMO: z.string().optional(),

  // Dashboard auth (Constraint §10).
  CORTEX_AUTH_SECRET: z.string().optional(),
  CORTEX_OPERATOR_EMAIL: z.string().optional(),
  CORTEX_OPERATOR_PASSWORD_HASH: z.string().optional(),

  // Gmail (Phase 1).
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  GMAIL_PUBSUB_TOPIC: z.string().optional(),

  // IMAP (Phase 1/3) — generic password-auth mailbox.
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().int().default(993),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),

  // Outlook.com / Microsoft 365 — IMAP over OAuth (basic auth is dead in 2026).
  // Registered in the same single non-Gmail IMAP slot; preferred over IMAP_* when set.
  OUTLOOK_CLIENT_ID: z.string().optional(),
  OUTLOOK_CLIENT_SECRET: z.string().optional(),
  OUTLOOK_REDIRECT_URI: z.string().optional(),
  OUTLOOK_REFRESH_TOKEN: z.string().optional(),
  OUTLOOK_USER: z.string().optional(),
  OUTLOOK_TENANT: z.string().default('common'),

  // Calendar (Phase 3).
  GOOGLE_CALENDAR_ID: z.string().default('primary'),

  // WhatsApp (Phase 4).
  WHATSAPP_BRIDGE_URL: z.string().optional(),
  WHATSAPP_BRIDGE_TOKEN: z.string().optional(),

  // iMessage (macOS chat.db sidecar — read-only).
  IMESSAGE_BRIDGE_URL: z.string().optional(),
  IMESSAGE_BRIDGE_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parse + cache the environment once. Throws a readable error on invalid env. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid CORTEX environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests — clear the memoized env. */
export function resetEnvCache(): void {
  cached = null;
}
