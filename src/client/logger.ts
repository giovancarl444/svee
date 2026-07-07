/**
 * Structured, redacting logger. JSON lines to stdout/stderr so the output is
 * grep-able and warehouse-ingestible. The redactor is the important part:
 * auth tokens, Basic headers, raw emails and other PII-adjacent values must
 * never reach the logs (GDPR §3.7) — not even at debug level.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Show only the last 4 chars of a secret: `redactSecret("abcd1234") -> "****1234"`. */
export function redactSecret(value: string | undefined | null): string {
  if (!value) return "";
  const s = String(value);
  if (s.length <= 4) return "****";
  return `****${s.slice(-4)}`;
}

const SENSITIVE_KEY = /(token|secret|password|authorization|auth|apikey|api_key|signature|sig)/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Long hex strings are almost always hashes/ids we don't want emitted verbatim.
const LONG_HEX_RE = /\b[a-f0-9]{32,}\b/gi;

/** Recursively redact secrets and PII-adjacent values from an arbitrary payload. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = typeof v === "string" ? redactSecret(v) : "[redacted]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function redactString(s: string): string {
  return s.replace(EMAIL_RE, "[email]").replace(LONG_HEX_RE, (m) => `[hash:${m.length}]`);
}

export interface Logger {
  level: LogLevel;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(level: LogLevel = "info", bindings: Record<string, unknown> = {}): Logger {
  const emit = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVEL_RANK[lvl] < LEVEL_RANK[level]) return;
    const line = {
      // Timestamp is added by the caller's runtime clock at emit time.
      ts: new Date().toISOString(),
      level: lvl,
      msg,
      ...bindings,
      ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
    };
    const sink = lvl === "error" || lvl === "warn" ? process.stderr : process.stdout;
    sink.write(JSON.stringify(line) + "\n");
  };
  return {
    level,
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (extra) => createLogger(level, { ...bindings, ...extra }),
  };
}

/** Silent logger for tests / library consumers who bring their own. */
export const nullLogger: Logger = {
  level: "error",
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => nullLogger,
};
