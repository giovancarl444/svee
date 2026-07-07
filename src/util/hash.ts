/**
 * PII hashing for GDPR (§3.7). Where impact.com expects a hashed customer
 * email, we send a hash — never raw PII, never PII in logs or the repo.
 *
 * ⚠️ VERIFY THE ALGORITHM: impact.com documents an exact hashing spec (which
 * algorithm, and how to normalise the email first). Docs egress was blocked in
 * this build, so the algorithm below is a CONFIGURABLE default, not a verified
 * fact. Confirm on the hashing/consent reference and set HASH_ALGO accordingly
 * before sending any hashed identifier live. Sending the wrong hash silently
 * breaks match rates — it does not error.
 */
import { createHash } from "node:crypto";

export type HashAlgo = "sha1" | "sha256";

/** Flip this once the docs confirm the required algorithm. VERIFY. */
export const HASH_ALGO: HashAlgo = "sha1";

/** Lower-case + trim. Some specs also strip gmail dots / +tags — VERIFY. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string, algo: HashAlgo = HASH_ALGO): string {
  return createHash(algo).update(normalizeEmail(email), "utf8").digest("hex");
}

/** Generic hex hash for any identifier we must not send in the clear. */
export function hashValue(value: string, algo: HashAlgo = HASH_ALGO): string {
  return createHash(algo).update(value, "utf8").digest("hex");
}
