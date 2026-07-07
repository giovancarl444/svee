/**
 * Postback/webhook verification. Two mechanisms, both supported because
 * impact.com deployments differ:
 *
 *   1. Shared-secret token — a secret embedded in the postback URL (?token=…)
 *      or a header, compared in constant time.
 *   2. HMAC signature — if impact sends a signature header, verify it against
 *      HMAC-SHA256(rawBody, secret).
 *
 * VERIFY (docs egress blocked): confirm which scheme your account uses and the
 * exact header name on the webhook-security reference, then set SIGNATURE_HEADER
 * accordingly. Until verified, prefer the shared-secret token — it is explicit.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Header impact.com would use to carry a signature. VERIFY the real name. */
export const SIGNATURE_HEADER = "x-impact-signature";

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function computeHmac(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export interface VerifyInput {
  rawBody: string;
  headers: Record<string, string | undefined>;
  /** Token pulled from the query string or a header. */
  providedToken?: string;
  secret: string | undefined;
}

export interface VerifyResult {
  ok: boolean;
  method: "hmac" | "token" | "none";
  reason?: string;
}

/**
 * Verify a postback. If a signature header is present, HMAC must match.
 * Otherwise the shared-secret token must match. With no secret configured we
 * fail closed unless explicitly in a dev context (caller decides).
 */
export function verifyPostback(input: VerifyInput): VerifyResult {
  const { rawBody, headers, providedToken, secret } = input;
  if (!secret) return { ok: false, method: "none", reason: "no WEBHOOK_SIGNING_SECRET configured" };

  const sig = headers[SIGNATURE_HEADER];
  if (sig) {
    const expected = computeHmac(rawBody, secret);
    return constantTimeEqual(sig, expected)
      ? { ok: true, method: "hmac" }
      : { ok: false, method: "hmac", reason: "signature mismatch" };
  }
  if (providedToken != null) {
    return constantTimeEqual(providedToken, secret)
      ? { ok: true, method: "token" }
      : { ok: false, method: "token", reason: "token mismatch" };
  }
  return { ok: false, method: "none", reason: "no signature header and no token provided" };
}
