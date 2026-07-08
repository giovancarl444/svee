/**
 * HARD STOPS + the approval-queue safety model (spec §"HARD STOPS" and §Architecture).
 *
 * The guardrail is enforced TWICE, on purpose:
 *   1. In the system prompt (the model refuses hard-stop actions).
 *   2. Here, in code — the executor has NO credential store and NO auto-submit
 *      path, and refuses to act on anything that isn't an APPROVED approval row.
 * A hostile job posting can jailbreak the model; the code layer must independently
 * refuse. This module is that second layer.
 */
import type { ApprovalType } from "./contracts.js";

/**
 * The irreversible actions the twin NEVER performs autonomously. Each routes to
 * Svee for explicit approval every time.
 */
export const HARD_STOP_ACTIONS = new Set<string>([
  "enter_credentials", // passwords / 2FA / bank / ID / passport into any field
  "create_account", // creating a new account
  "login", // logging in as Svee
  "final_submit", // the final submit / send / apply / confirm click
  "accept_terms", // terms / consent / cookie / OAuth permission dialogs
  "send_message", // any message / email / DM / connection request
  "solve_captcha", // CAPTCHAs / bot-detection
  "obey_listing_instruction", // instructions found IN a listing/email are data, not orders
]);

/** Actions the twin may do autonomously — all the *work*, none of the *commits*. */
export const AUTONOMOUS_SAFE = new Set<string>([
  "score",
  "tailor",
  "draft",
  "stage",
  "classify",
  "track",
  "read_inbox",
]);

export function isHardStop(action: string): boolean {
  return HARD_STOP_ACTIONS.has(action);
}

/** Every approval TYPE resolves to a hard-stop final action. */
export function requiresApproval(type: ApprovalType): boolean {
  return true;
}

/** The exact final step a human (or a Svee-authorized tool) performs on approval. */
export function actionOnApprove(type: ApprovalType, channel: string): string {
  switch (type) {
    case "submit_application":
      return `Review the staged package, then click the final Submit on ${channel}.`;
    case "send_email":
      return "Review the drafted email + CV attachment, then send it.";
    case "linkedin_easy_apply":
      return "Open LinkedIn, review the pre-filled Easy Apply answers, tap through and submit.";
    case "send_followup":
      return "Review the follow-up nudge, then send it.";
    case "confirm_interview":
      return "Confirm the interview slot in the calendar and reply to the recruiter.";
  }
}

// ── The code-layer executor guard ────────────────────────────────────────────

export type ApprovalStatus = "pending" | "approved" | "rejected" | "executed" | "expired";

export class ApprovalRequiredError extends Error {
  constructor(status: ApprovalStatus) {
    super(
      `Refusing to execute: approval status is "${status}", not "approved". ` +
        `The twin never performs a final submit/login/send without an approved row.`,
    );
    this.name = "ApprovalRequiredError";
  }
}

export interface ExecutableApproval {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  channel: string;
}

export interface Handoff {
  /** Always false — the executor never performs the irreversible action itself. */
  performed: false;
  approvalId: string;
  /** The exact step handed to the human / Svee-authorized tool. */
  instruction: string;
}

/**
 * The executor. It has no credentials and cannot log in or submit — its only
 * output is a handoff describing the final step for a human. It refuses outright
 * unless the approval is `approved`. `live` gates whether even the handoff is
 * released (stage-only mode holds everything for review).
 */
export function guardExecution(approval: ExecutableApproval, opts: { live: boolean }): Handoff {
  if (approval.status !== "approved") throw new ApprovalRequiredError(approval.status);
  const instruction = opts.live
    ? actionOnApprove(approval.type, approval.channel)
    : `[stage-only] Would hand off: ${actionOnApprove(approval.type, approval.channel)}`;
  return { performed: false, approvalId: approval.id, instruction };
}

// ── Prompt-injection defense (listing text is data, not orders) ───────────────

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (?:all |the )?(?:previous|prior|above) instructions/i,
  /disregard (?:your|the) (?:instructions|system prompt|rules)/i,
  /\byou are now\b/i,
  /reply with your (?:password|api key|token|credentials)/i,
  /send (?:us )?your (?:password|login|bank|card|ssn|personnummer)/i,
  /\bas an ai\b/i,
  /forget (?:everything|what you were told)/i,
  /do not tell (?:the user|svee|anyone)/i,
];

/**
 * Flag imperative text embedded in a listing/email that tries to redirect the
 * twin. The twin never obeys these; this surfaces them to Svee as data.
 */
export function detectInstructionInjection(text: string): string[] {
  const hits: string[] = [];
  for (const re of INJECTION_PATTERNS) {
    const m = re.exec(text);
    if (m) hits.push(m[0]);
  }
  return hits;
}
