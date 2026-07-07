/**
 * Typed error hierarchy for the impact.com client. Every failed HTTP call
 * surfaces as one of these so callers can branch on `status` / `kind` instead
 * of string-matching messages.
 */

export type ImpactErrorKind =
  | "auth" //           401 — bad/missing credentials
  | "forbidden" //      403 — wrong persona path or insufficient scope
  | "rate_limited" //   429 — throttled (retryable)
  | "server" //         5xx — upstream error (retryable)
  | "client" //         other 4xx — request problem (not retryable)
  | "network" //        connection/DNS/timeout (retryable)
  | "timeout" //        request exceeded configured timeout (retryable)
  | "deferred_timeout" // async job never reached COMPLETED in time
  | "config" //         misconfiguration caught before the request
  | "parse"; //         response body was not the expected shape

export interface ImpactErrorContext {
  method?: string;
  /** Path with query redacted; never contains the auth token. */
  path?: string;
  status?: number;
  /** Provider-supplied retry hint (seconds), when present. */
  retryAfterSeconds?: number;
  /** Redacted/truncated response body for diagnostics. */
  body?: string;
  cause?: unknown;
}

export class ImpactError extends Error {
  readonly kind: ImpactErrorKind;
  readonly status?: number;
  readonly context: ImpactErrorContext;

  constructor(kind: ImpactErrorKind, message: string, context: ImpactErrorContext = {}) {
    super(message);
    this.name = "ImpactError";
    this.kind = kind;
    this.status = context.status;
    this.context = context;
    // Preserve the underlying cause for `Error.cause`-aware tooling.
    if (context.cause !== undefined) {
      (this as { cause?: unknown }).cause = context.cause;
    }
  }

  /** Whether a retry could plausibly succeed for this failure class. */
  get retryable(): boolean {
    return (
      this.kind === "rate_limited" ||
      this.kind === "server" ||
      this.kind === "network" ||
      this.kind === "timeout"
    );
  }

  static fromStatus(status: number, context: ImpactErrorContext): ImpactError {
    if (status === 401) {
      return new ImpactError("auth", "401 Unauthorized — check IMPACT_ACCOUNT_SID / IMPACT_AUTH_TOKEN.", {
        ...context,
        status,
      });
    }
    if (status === 403) {
      return new ImpactError(
        "forbidden",
        "403 Forbidden — wrong persona base path for these credentials, or missing scope.",
        { ...context, status },
      );
    }
    if (status === 429) {
      return new ImpactError("rate_limited", "429 Too Many Requests — rate limited.", {
        ...context,
        status,
      });
    }
    if (status >= 500) {
      return new ImpactError("server", `${status} upstream server error.`, { ...context, status });
    }
    return new ImpactError("client", `${status} client error.`, { ...context, status });
  }
}

/** Narrowing helper for `catch` blocks. */
export function isImpactError(err: unknown): err is ImpactError {
  return err instanceof ImpactError;
}
