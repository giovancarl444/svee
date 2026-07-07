/**
 * OUTPUT CONTRACTS (spec §4). Every run emits exactly one object matching
 * `TwinRunOutputSchema`. These zod schemas are the wire format between the twin
 * and the Cortex engine; validating against them before returning guarantees the
 * orchestrator never emits a malformed digest, approval, or alert.
 */
import { z } from "zod";

export const ApprovalType = z.enum([
  "submit_application",
  "send_email",
  "linkedin_easy_apply",
  "send_followup",
  "confirm_interview",
]);
export type ApprovalType = z.infer<typeof ApprovalType>;

export const AlertPriority = z.enum(["critical", "high", "normal"]);
export type AlertPriority = z.infer<typeof AlertPriority>;

export const AlertKind = z.enum([
  "interview_request",
  "offer",
  "recruiter_question",
  "rejection",
  "ghost_followup",
]);
export type AlertKind = z.infer<typeof AlertKind>;

export const TopMatchSchema = z.object({
  company: z.string(),
  role: z.string(),
  fit_score: z.number(),
  channel: z.string(),
  why: z.string(),
  url: z.string(),
});

export const DigestSchema = z.object({
  run_at: z.string(), // ISO-8601
  found: z.number(),
  scored: z.number(),
  passed_threshold: z.number(),
  staged: z.number(),
  submitted_prev_run: z.number(),
  needs_decision: z.array(z.string()), // highest priority first
  top_matches: z.array(TopMatchSchema),
  discarded_low_fit: z.number(),
});
export type Digest = z.infer<typeof DigestSchema>;

export const ScreeningAnswerSchema = z.object({ q: z.string(), a: z.string() });

export const ApprovalRequestSchema = z.object({
  id: z.string(), // uuid
  type: ApprovalType,
  company: z.string(),
  role: z.string(),
  url: z.string(),
  channel: z.string(),
  cv_variant: z.enum(["A", "B", "C"]).nullable(),
  cover_letter: z.string(),
  screening_answers: z.array(ScreeningAnswerSchema),
  missing_fields: z.array(z.string()), // anything the form needs that the KB lacks
  fit_score: z.number(),
  action_on_approve: z.string(), // the exact final step the human/executor performs
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const CortexAlertSchema = z.object({
  priority: AlertPriority,
  kind: AlertKind,
  company: z.string(),
  role: z.string(),
  summary: z.string(),
  suggested_reply: z.string(), // a draft — NOT sent
  requires: z.string(), // what Svee must decide
});
export type CortexAlert = z.infer<typeof CortexAlertSchema>;

export const PipelineWriteSchema = z.object({
  op: z.enum(["insert", "update"]),
  table: z.enum(["jobs", "applications", "messages"]),
  record: z.record(z.string(), z.unknown()),
});
export type PipelineWrite = z.infer<typeof PipelineWriteSchema>;

export const TwinRunOutputSchema = z.object({
  digest: DigestSchema,
  approval_requests: z.array(ApprovalRequestSchema),
  cortex_alerts: z.array(CortexAlertSchema),
  pipeline_writes: z.array(PipelineWriteSchema),
});
export type TwinRunOutput = z.infer<typeof TwinRunOutputSchema>;
