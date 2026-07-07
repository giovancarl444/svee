/**
 * Persona is THE decision that shapes every request path on impact.com.
 * Three personas, three base paths, three independent version lines.
 *
 *   brand   (advertiser) -> /Advertisers/{SID}/...
 *   partner (publisher)  -> /Mediapartners/{SID}/...
 *   agency               -> /Agencies/{SID}/...
 *
 * VERIFY (docs egress was blocked in this build): confirm the exact casing of
 * the base-path segments against the live reference (esp. `Mediapartners`).
 * These are single-source constants here so a correction is a one-line change.
 */

export type Persona = "brand" | "partner" | "agency";

export const PERSONAS: readonly Persona[] = ["brand", "partner", "agency"] as const;

/** Base-path segment inserted before `{SID}` for each persona. */
export const PERSONA_BASE_SEGMENT: Record<Persona, string> = {
  brand: "Advertisers",
  partner: "Mediapartners",
  agency: "Agencies",
};

/**
 * Build the account-scoped base path for a persona, e.g.
 *   basePathFor("brand", "IRxyz") -> "/Advertisers/IRxyz"
 * The trailing resource path is appended by each resource module.
 */
export function basePathFor(persona: Persona, accountSid: string): string {
  const segment = PERSONA_BASE_SEGMENT[persona];
  return `/${segment}/${accountSid}`;
}

export function isPersona(value: string): value is Persona {
  return (PERSONAS as readonly string[]).includes(value);
}
