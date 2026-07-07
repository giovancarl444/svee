/**
 * INBOX classification (spec §"THE DAILY LOOP" step 6). Read-only classification
 * of recruiter/employer replies is safe to automate; SENDING replies always stays
 * in the approval queue. This module only reads and labels.
 *
 * Bilingual (English + Swedish) — the default language of the reply drives the
 * draft reply's language elsewhere. Classification here is keyword-heuristic and
 * pure, so it's fully unit-tested.
 */
import type { AlertPriority } from "./contracts.js";
import type { MessageChannelKind } from "./channels.js";

export type ReplyKind =
  | "rejection"
  | "recruiter_screen"
  | "interview_request"
  | "offer"
  | "ghost"
  | "other";

export interface InboundMessage {
  id: string;
  from?: string;
  subject?: string;
  body: string;
  receivedAt?: string;
  /** Optional hint linking the message to a pipeline application. */
  applicationId?: string;
  company?: string;
  role?: string;
  /** Which channel this arrived on (a reply goes back on the same channel). */
  via?: MessageChannelKind;
}

export interface ReplyClassification {
  kind: ReplyKind;
  priority: AlertPriority;
  /** The phrases that drove the classification (for transparency in the alert). */
  signals: string[];
}

const OFFER = [
  "job offer",
  "offer letter",
  "we'd like to offer",
  "we would like to offer",
  "pleased to offer",
  "you're hired",
  "you are hired",
  "erbjuda dig",
  "erbjudande",
  "välkommen ombord",
  "vi vill anställa",
];

const INTERVIEW = [
  "interview",
  "intervju",
  "schedule a call",
  "book a time",
  "set up a call",
  "calendly",
  "available for a call",
  "would you be available",
  "meet the team",
  "onsite",
  "on-site interview",
  "boka en tid",
  "träffas",
  "nästa steg är ett samtal",
];

const SCREEN = [
  "quick chat",
  "a few questions",
  "couple of questions",
  "screening call",
  "phone screen",
  "recruiter screen",
  "tell us more",
  "get to know you",
  "några frågor",
  "kort samtal",
  "screening",
];

const REJECTION = [
  "unfortunately",
  "not moving forward",
  "won't be moving forward",
  "decided to proceed with other",
  "move forward with other candidates",
  "we regret",
  "not a fit",
  "not selected",
  "position has been filled",
  "tyvärr",
  "gått vidare med andra",
  "inte gå vidare",
  "valt att gå vidare med",
];

function findAll(haystack: string, needles: string[]): string[] {
  const lc = haystack.toLowerCase();
  return needles.filter((n) => lc.includes(n));
}

export function classifyReply(msg: InboundMessage): ReplyClassification {
  const text = `${msg.subject ?? ""}\n${msg.body}`;

  // Score every category by hit count, not first-match. A rejection that mentions
  // "interview" ("we enjoyed your interview but unfortunately…") has more rejection
  // hits than interview hits, so it classifies as a rejection instead of an
  // interview request. Ties break by this priority order (offer first).
  const cats: Array<{ kind: ReplyKind; priority: AlertPriority; hits: string[] }> = [
    { kind: "offer", priority: "critical", hits: findAll(text, OFFER) },
    { kind: "interview_request", priority: "high", hits: findAll(text, INTERVIEW) },
    { kind: "recruiter_screen", priority: "normal", hits: findAll(text, SCREEN) },
    { kind: "rejection", priority: "normal", hits: findAll(text, REJECTION) },
  ];

  // Stable sort keeps the priority order on ties.
  const scored = cats.filter((c) => c.hits.length).sort((a, b) => b.hits.length - a.hits.length);
  const best = scored[0];
  if (!best) return { kind: "other", priority: "normal", signals: [] };
  return { kind: best.kind, priority: best.priority, signals: best.hits };
}

/** Is this reply text primarily Swedish? Drives the language of a drafted reply. */
export function isSwedish(text: string): boolean {
  const sv = (text.match(/[åäöÅÄÖ]/g) ?? []).length;
  const swedishWords = ["och", "att", "för", "vi", "med", "tack", "hej", "du"];
  const wordHits = swedishWords.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(text)).length;
  return sv >= 2 || wordHits >= 2;
}
