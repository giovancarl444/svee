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

  const offer = findAll(text, OFFER);
  if (offer.length) return { kind: "offer", priority: "critical", signals: offer };

  const interview = findAll(text, INTERVIEW);
  if (interview.length) return { kind: "interview_request", priority: "high", signals: interview };

  const screen = findAll(text, SCREEN);
  if (screen.length) return { kind: "recruiter_screen", priority: "normal", signals: screen };

  const rejection = findAll(text, REJECTION);
  if (rejection.length) return { kind: "rejection", priority: "normal", signals: rejection };

  return { kind: "other", priority: "normal", signals: [] };
}

/** Is this reply text primarily Swedish? Drives the language of a drafted reply. */
export function isSwedish(text: string): boolean {
  const sv = (text.match(/[åäöÅÄÖ]/g) ?? []).length;
  const swedishWords = ["och", "att", "för", "vi", "med", "tack", "hej", "du"];
  const wordHits = swedishWords.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(text)).length;
  return sv >= 2 || wordHits >= 2;
}
