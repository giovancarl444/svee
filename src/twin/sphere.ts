/**
 * The SPHERE contract — the boundary the twin hands approved actions to.
 *
 * The twin produces a typed `ExecutionPlan` for every staged action (application
 * or message) on every channel. Sphere — the approved executor, which holds the
 * credentials — is the ONLY thing that performs the final submit/send/login, and
 * ONLY for an approved plan. Wiring Sphere later is a one-file drop-in: implement
 * `SphereExecutor`.
 *
 * The twin ships with `StagingSphere`, a deliberately inert executor: it has no
 * credentials and never sends. Even if it were mis-wired into the run loop, it
 * returns a handoff instead of acting — the belt to the prompt-layer suspenders.
 */
import type { ApprovalRequest, ApprovalType } from "./contracts.js";
import type { ChannelId } from "./channels.js";
import { ApprovalRequiredError } from "./guardrails.js";

export interface ExecutionPlan {
  approvalId: string;
  action: ApprovalType;
  channel: ChannelId;
  target: { url?: string; email?: string; handle?: string };
  payload: {
    coverLetter?: string;
    subject?: string;
    message?: string;
    cvVariant?: string | null;
    screeningAnswers?: Array<{ q: string; a: string }>;
  };
  /** The exact final step Sphere performs. */
  handoff: string;
}

export interface SphereContext {
  /** True only when Svee has approved this plan's approval row. */
  approved: boolean;
  /** Live gate — even approved, stage-only mode holds execution. */
  live: boolean;
}

export interface ExecutionResult {
  ok: boolean;
  performed: boolean;
  note: string;
}

/** Sphere implements this. It is the ONLY place a final action is performed. */
export interface SphereExecutor {
  execute(plan: ExecutionPlan, ctx: SphereContext): Promise<ExecutionResult>;
}

/** Build the structured plan Sphere consumes from an approval row. */
export function planFromApproval(approval: ApprovalRequest): ExecutionPlan {
  const isMessage = approval.type === "send_followup" || approval.type === "confirm_interview";
  return {
    approvalId: approval.id,
    action: approval.type,
    channel: approval.channel as ChannelId,
    target: { ...(approval.url ? { url: approval.url } : {}) },
    payload: isMessage
      ? { message: approval.cover_letter }
      : {
          coverLetter: approval.cover_letter,
          cvVariant: approval.cv_variant,
          screeningAnswers: approval.screening_answers,
        },
    handoff: approval.action_on_approve,
  };
}

/**
 * The twin-side default executor. Never sends: it refuses unapproved plans
 * outright and, even for approved ones, only returns the handoff (no credentials,
 * no submit path). Replace with a real `SphereExecutor` to actually act on tap.
 */
export class StagingSphere implements SphereExecutor {
  async execute(plan: ExecutionPlan, ctx: SphereContext): Promise<ExecutionResult> {
    if (!ctx.approved) throw new ApprovalRequiredError("pending");
    const prefix = ctx.live ? "" : "[stage-only] ";
    return {
      ok: true,
      performed: false, // StagingSphere NEVER performs the final action.
      note: `${prefix}No executor wired — hand off to Sphere: ${plan.handoff}`,
    };
  }
}
