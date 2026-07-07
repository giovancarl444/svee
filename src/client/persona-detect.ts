/**
 * Persona auto-detection (§2). With the provided SID/token, probe the Campaigns
 * endpoint under each persona's base path. Exactly one should return 200; the
 * others 403 (wrong persona path/scope). The 200 wins.
 *
 * We disable retries here: a 403 is a definitive "not this persona", not a
 * transient failure, and probing three paths should be fast and cheap.
 */
import type { HttpClient } from "./http.js";
import type { ImpactConfig } from "./config.js";
import { PERSONAS, PERSONA_BASE_SEGMENT, type Persona } from "./persona.js";
import { isImpactError } from "./errors.js";

export interface PersonaProbe {
  persona: Persona;
  path: string;
  status: number | "error";
  ok: boolean;
  detail?: string;
}

export interface PersonaDetection {
  detected: Persona | null;
  configured: Persona;
  matchesConfig: boolean;
  ambiguous: boolean;
  probes: PersonaProbe[];
}

/** Probe one persona's Campaigns endpoint and report the raw outcome. */
async function probe(http: HttpClient, config: ImpactConfig, persona: Persona): Promise<PersonaProbe> {
  const path = `/${PERSONA_BASE_SEGMENT[persona]}/${config.accountSid}/Campaigns`;
  try {
    const res = await http.get<unknown>(path, { maxRetries: 0, query: { PageSize: 1 } });
    return { persona, path, status: res.status, ok: res.status >= 200 && res.status < 300 };
  } catch (err) {
    if (isImpactError(err)) {
      const status = err.status ?? "error";
      return { persona, path, status, ok: false, detail: err.kind };
    }
    return { persona, path, status: "error", ok: false, detail: (err as Error).message };
  }
}

export async function detectPersona(http: HttpClient, config: ImpactConfig): Promise<PersonaDetection> {
  const probes: PersonaProbe[] = [];
  for (const persona of PERSONAS) {
    probes.push(await probe(http, config, persona));
  }
  const winners = probes.filter((p) => p.ok).map((p) => p.persona);
  const detected = winners.length === 1 ? (winners[0] as Persona) : null;
  return {
    detected,
    configured: config.persona,
    matchesConfig: detected === config.persona,
    ambiguous: winners.length > 1,
    probes,
  };
}
