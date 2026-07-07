/**
 * The redaction / allowlist layer (Constraint §2: data minimization to the model).
 *
 * INVARIANT: these builders are the ONLY way a Claude request payload is
 * constructed, and the object they return is BOTH what is sent to Anthropic AND
 * what is stored verbatim in `api_calls.input_summary`. So "what left the box"
 * for any call == the stored `input_summary` == a builder output. Nothing else
 * about an item (never the full `body_text`, never a raw email chain) can leave
 * unless it is explicitly added to an allowlist here.
 */

/** Hard cap on any snippet leaving the box, so a "snippet" can't smuggle a body. */
export const MAX_SNIPPET_CHARS = 500;

export function boundSnippet(text: string | null | undefined): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_SNIPPET_CHARS ? `${clean.slice(0, MAX_SNIPPET_CHARS)}…` : clean;
}

// --- Tier 1: triage (Haiku) — subject + sender + snippet only ----------------
export interface TriagePayload {
  source: string;
  sender_display: string;
  sender_importance: number;
  timestamp: string;
  subject: string | null;
  snippet: string;
}

export function buildTriagePayload(input: {
  source: string;
  senderDisplay: string;
  senderImportance: number;
  timestamp: Date;
  subject?: string | null;
  bodySnippet?: string | null;
}): TriagePayload {
  return {
    source: input.source,
    sender_display: input.senderDisplay,
    sender_importance: input.senderImportance,
    timestamp: input.timestamp.toISOString(),
    subject: input.subject ?? null,
    snippet: boundSnippet(input.bodySnippet),
  };
}

// --- Tier 2: escalation (Sonnet) — richer context for ambiguous/high-stakes ---
export interface EscalatePayload extends TriagePayload {
  /** A few earlier snippets from the same thread — still bounded, never full bodies. */
  thread_context: string[];
  entity_notes: string | null;
}

export function buildEscalatePayload(input: {
  base: TriagePayload;
  threadSnippets?: string[];
  entityNotes?: string | null;
}): EscalatePayload {
  return {
    ...input.base,
    thread_context: (input.threadSnippets ?? []).map(boundSnippet).filter(Boolean),
    entity_notes: input.entityNotes ?? null,
  };
}

// --- Tier 3: synthesis (Opus) — the day's action items, loops, calendar -------
export interface SynthesisAction {
  source: string;
  sender_display: string;
  action_summary: string;
  urgency: number;
  deadline: string | null;
}
export interface SynthesisLoop {
  type: string;
  description: string;
  due: string | null;
}
export interface SynthesisEvent {
  title: string;
  start: string;
  end: string | null;
}
export interface SynthesisPayload {
  evening_date: string;
  actions: SynthesisAction[];
  loops: SynthesisLoop[];
  events: SynthesisEvent[];
}
