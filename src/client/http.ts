/**
 * The resilient HTTP core. Every impact.com call goes through here.
 *
 * Responsibilities:
 *   - HTTP Basic auth (AccountSID = user, AuthToken = password)
 *   - JSON by default; form-encoded bodies for write endpoints
 *   - per-request timeout via AbortController
 *   - retry with exponential backoff + full jitter on 429/5xx/network/timeout
 *   - honour `Retry-After` (seconds or HTTP-date) when present
 *   - structured, redacted logging (never emits the token or PII)
 *   - version-pinning hook (none | header; `path` intentionally unimplemented)
 *
 * `fetch` and `sleep` are injectable so retry/backoff is unit-testable with no
 * real network and no real waiting.
 */
import type { ImpactConfig } from "./config.js";
import { activeVersion } from "./config.js";
import { ImpactError } from "./errors.js";
import { createLogger, redactSecret, type Logger } from "./logger.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryValue = string | number | boolean | Date | null | undefined | Array<string | number>;
export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  method?: HttpMethod;
  query?: QueryParams;
  /** JSON body (sets Content-Type: application/json). Mutually exclusive with `form`. */
  body?: unknown;
  /** Form body (sets Content-Type: application/x-www-form-urlencoded). */
  form?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Optional idempotency hint header. Note: impact.com's true dedupe key is the
   *  natural id in the payload (e.g. OrderId), which resource modules always set. */
  idempotencyKey?: string;
  accept?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Response handling. `raw` returns the Response untouched (for downloads). */
  parse?: "json" | "text" | "raw";
  /** External abort (e.g. a deferred-poll deadline). Composed with the timeout. */
  signal?: AbortSignal;
}

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
  /** Number of attempts made (1 = succeeded first try). */
  attempts: number;
}

export interface HttpDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  logger: Logger;
  /** Deterministic jitter source for tests; defaults to Math.random. */
  random: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HttpClient {
  private readonly config: ImpactConfig;
  private readonly deps: HttpDeps;
  private readonly authHeader: string;

  constructor(config: ImpactConfig, deps?: Partial<HttpDeps>) {
    this.config = config;
    this.deps = {
      fetch: deps?.fetch ?? globalThis.fetch,
      sleep: deps?.sleep ?? defaultSleep,
      logger: deps?.logger ?? createLogger(config.logLevel, { comp: "http" }),
      random: deps?.random ?? Math.random,
    };
    if (!this.deps.fetch) {
      throw new ImpactError("config", "No global fetch available; provide deps.fetch (Node >= 18).");
    }
    const basic = Buffer.from(`${config.accountSid}:${config.authToken}`, "utf8").toString("base64");
    this.authHeader = `Basic ${basic}`;
  }

  get<T>(path: string, options: Omit<RequestOptions, "method" | "body" | "form"> = {}): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T>(path: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: "POST" });
  }

  put<T>(path: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: "PUT" });
  }

  delete<T>(path: string, options: Omit<RequestOptions, "body" | "form"> = {}): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }

  /** Build a fully-qualified URL for `path` (absolute paths only), applying query. */
  buildUrl(path: string, query?: QueryParams): string {
    // Deferred jobs hand back absolute URLs; pass those through unchanged.
    const base = /^https?:\/\//i.test(path) ? path : `${this.config.apiHost}${path}`;
    const url = new URL(base);
    if (this.config.versionStrategy === "path") {
      throw new ImpactError(
        "config",
        "IMPACT_VERSION_STRATEGY=path is not wired — verify the exact scheme in .../versioning.md and implement before use.",
      );
    }
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value == null) continue;
        if (Array.isArray(value)) {
          for (const v of value) url.searchParams.append(key, String(v));
        } else if (value instanceof Date) {
          url.searchParams.set(key, value.toISOString());
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    const method = options.method ?? "GET";
    const url = this.buildUrl(path, options.query);
    const maxRetries = options.maxRetries ?? this.config.http.maxRetries;
    const timeoutMs = options.timeoutMs ?? this.config.http.timeoutMs;
    const parse = options.parse ?? "json";

    const headers = this.baseHeaders(options);
    const bodyInit = this.encodeBody(options, headers);
    // Path only, query stripped — safe to log (never contains the token).
    const logPath = new URL(url).pathname;

    let attempt = 0;
    // Attempts = 1 initial + up to maxRetries.
    for (;;) {
      attempt++;
      const started = Date.now();
      const { signal, cancel } = this.composeSignal(timeoutMs, options.signal);
      try {
        const res = await this.deps.fetch(url, { method, headers, body: bodyInit, signal });
        this.logRateLimit(res, logPath);

        if (res.ok) {
          // Keep the timeout armed THROUGH the body read: fetch resolves on
          // headers, and a stalled body must still trip the timeout.
          const data = await this.parseBody<T>(res, parse);
          cancel();
          this.deps.logger.debug("request ok", { method, path: logPath, status: res.status, attempt, durationMs: Date.now() - started });
          return { status: res.status, headers: res.headers, data, attempts: attempt };
        }

        const bodyText = await safeText(res);
        cancel();
        const err = ImpactError.fromStatus(res.status, {
          method,
          path: logPath,
          status: res.status,
          retryAfterSeconds: parseRetryAfter(res.headers.get("retry-after")),
          body: truncate(bodyText),
        });

        if (err.retryable && attempt <= maxRetries) {
          const delay = this.backoffDelay(attempt, err.context.retryAfterSeconds);
          this.deps.logger.warn("request retrying", {
            method,
            path: logPath,
            status: res.status,
            attempt,
            nextDelayMs: delay,
          });
          await this.deps.sleep(delay);
          continue;
        }
        this.deps.logger.error("request failed", { method, path: logPath, status: res.status, attempt });
        throw err;
      } catch (rawErr) {
        cancel();
        // Caller-initiated cancellation (external AbortSignal) is honoured
        // immediately and never retried — it is not a transient failure.
        if (options.signal?.aborted) {
          throw new ImpactError("canceled", "Request canceled by caller.", {
            method,
            path: logPath,
            cause: options.signal.reason,
          });
        }
        if (rawErr instanceof ImpactError && rawErr.kind !== "network" && rawErr.kind !== "timeout") {
          throw rawErr; // already classified & non-retryable (or exhausted)
        }
        const err = classifyThrow(rawErr, { method, path: logPath });
        if (err.retryable && attempt <= maxRetries) {
          const delay = this.backoffDelay(attempt);
          this.deps.logger.warn("request retrying (transport)", {
            method,
            path: logPath,
            kind: err.kind,
            attempt,
            nextDelayMs: delay,
          });
          await this.deps.sleep(delay);
          continue;
        }
        this.deps.logger.error("request failed (transport)", { method, path: logPath, kind: err.kind, attempt });
        throw err;
      }
    }
  }

  private baseHeaders(options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: options.accept ?? "application/json",
      "User-Agent": "impact-integration/0.1 (+resilient-client)",
      ...options.headers,
    };
    if (this.config.versionStrategy === "header") {
      headers[this.config.versionHeader] = activeVersion(this.config);
    }
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    return headers;
  }

  private encodeBody(options: RequestOptions, headers: Record<string, string>): string | undefined {
    if (options.form) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(options.form)) {
        if (v === undefined) continue;
        params.set(k, String(v));
      }
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      return params.toString();
    }
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      return JSON.stringify(options.body);
    }
    return undefined;
  }

  private async parseBody<T>(res: Response, parse: RequestOptions["parse"]): Promise<T> {
    if (parse === "raw") return res as unknown as T;
    if (parse === "text") return (await res.text()) as unknown as T;
    if (res.status === 204) return undefined as unknown as T;
    const text = await res.text();
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new ImpactError("parse", "Response was not valid JSON.", { body: truncate(text), cause });
    }
  }

  /**
   * Full-jitter exponential backoff: delay = random(0, min(cap, base * 2^n)).
   * If the server sent Retry-After, honour it as a floor.
   */
  backoffDelay(attempt: number, retryAfterSeconds?: number): number {
    const { backoffBaseMs, backoffMaxMs, retryAfterMaxMs } = this.config.http;
    const exp = Math.min(backoffMaxMs, backoffBaseMs * 2 ** (attempt - 1));
    const jittered = Math.floor(this.deps.random() * exp);
    // Honour Retry-After as a floor, but cap it so a pathological value
    // (e.g. `Retry-After: 86400`) can't block a stage for hours.
    const retryAfterMs = retryAfterSeconds != null ? Math.min(retryAfterSeconds * 1000, retryAfterMaxMs) : 0;
    return Math.max(jittered, retryAfterMs);
  }

  private composeSignal(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new ImpactError("timeout", `Request exceeded ${timeoutMs}ms.`)), timeoutMs);
    const onExternalAbort = () => controller.abort(external?.reason);
    if (external) {
      if (external.aborted) controller.abort(external.reason);
      else external.addEventListener("abort", onExternalAbort, { once: true });
    }
    return {
      signal: controller.signal,
      cancel: () => {
        clearTimeout(timer);
        external?.removeEventListener("abort", onExternalAbort);
      },
    };
  }

  private logRateLimit(res: Response, path: string): void {
    // Capture whatever rate-limit signalling impact.com sends so observed
    // numbers can be recorded in INTEGRATION_NOTES.md (§3.4).
    const fields: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      if (/ratelimit|rate-limit|retry-after/i.test(key)) fields[key] = value;
    });
    if (Object.keys(fields).length) {
      this.deps.logger.debug("rate-limit headers", { path, ...fields });
    }
  }

  /** Redacted view of the effective auth principal, for smoke-test output. */
  describeIdentity(): string {
    return `SID=${redactSecret(this.config.accountSid)} token=${redactSecret(this.config.authToken)} persona=${this.config.persona}`;
  }
}

function classifyThrow(err: unknown, ctx: { method: string; path: string }): ImpactError {
  if (err instanceof ImpactError) return err;
  const name = (err as { name?: string })?.name;
  if (name === "AbortError" || name === "TimeoutError") {
    return new ImpactError("timeout", "Request aborted/timed out.", { ...ctx, cause: err });
  }
  return new ImpactError("network", `Network error: ${(err as Error)?.message ?? String(err)}`, { ...ctx, cause: err });
}

/** Parse Retry-After: integer seconds, or an HTTP-date -> seconds from now. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const asInt = Number(value);
  if (Number.isFinite(asInt)) return Math.max(0, asInt);
  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  return undefined;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function truncate(s: string, max = 500): string {
  return s.length > max ? `${s.slice(0, max)}…[${s.length} bytes]` : s;
}
