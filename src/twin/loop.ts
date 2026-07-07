/**
 * THE DAILY LOOP (spec §"THE DAILY LOOP"). One invocation runs the seven steps —
 * intake → score → tailor → stage → track → monitor/route → report — and returns
 * exactly one `TwinRunOutput` (validated against the contract schemas).
 *
 * This orchestrator never touches the DB or the network: it takes the intake, the
 * pipeline state, and its dependencies (KB, config, optional LLM) as inputs and
 * returns pure data. The script wires the DB reads/writes around it. That makes
 * the entire decision path unit-testable with a fixed clock and id generator.
 */
import { randomUUID } from "node:crypto";
import type { KnowledgeBase } from "./kb.schema.js";
import type { TwinConfig } from "./config.js";
import type { LlmClient } from "./llm.js";
import type {
  ApprovalRequest,
  CortexAlert,
  Digest,
  PipelineWrite,
  TwinRunOutput,
} from "./contracts.js";
import { TwinRunOutputSchema } from "./contracts.js";
import { jobKey, type RoleFacts } from "./facts.js";
import { scoreRole, type ScoreResult } from "./scoring.js";
import { selectChannel } from "./channel.js";
import { actionOnApprove, detectInstructionInjection } from "./guardrails.js";
import { buildScreeningAnswers, draftCoverLetter, pickCvVariant } from "./tailor.js";
import { classifyReply, isSwedish, type InboundMessage } from "./inbox.js";
import { buildSystemPrompt } from "./prompt.js";
import { parseListing } from "./sources/parse.js";
import type { RawListing } from "./sources/types.js";

export interface FollowupDue {
  applicationId: string;
  company: string;
  role: string;
  channel: string;
  daysWaiting: number;
}

export interface TwinRunInput {
  kb: KnowledgeBase;
  missingSlots: string[];
  config: TwinConfig;
  /** Combined intake (pasted links first, then configured sources). */
  listings: RawListing[];
  /** Inbound recruiter/employer replies to classify + route. */
  inbound?: InboundMessage[];
  state: {
    /** company::role of applications still live — never re-apply to these. */
    liveApplicationKeys: Set<string>;
    submittedPrevRun: number;
    /** High-fit applications past the follow-up window with no reply. */
    followupsDue?: FollowupDue[];
  };
  /** Live drafting client; omit for the deterministic KB-bound path. */
  llm?: LlmClient;
  now: Date;
  /** Deterministic in tests; defaults to randomUUID. */
  idGen?: () => string;
}

function appKey(company: string, role: string): string {
  return `${company.toLowerCase()}::${role.toLowerCase()}`;
}

function addDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

// ── Deterministic, KB-bound reply drafts (holding replies — never sent) ────────

function holdingReply(kind: "offer" | "interview_request" | "recruiter_screen", swedish: boolean, kb: KnowledgeBase): string {
  const name = kb.profile.preferredName;
  if (kind === "offer") {
    return swedish
      ? `Tack så mycket för erbjudandet — jag är väldigt intresserad. Jag vill gå igenom villkoren ordentligt och återkommer med besked inom kort. / ${name}`
      : `Thank you for the offer — I'm very interested. I'd like to review the terms properly and will revert with a decision shortly. — ${name}`;
  }
  if (kind === "interview_request") {
    return swedish
      ? `Tack, det låter jättebra — jag tar gärna nästa steg. Föreslå ett par tider så bekräftar jag. / ${name}`
      : `Thanks — happy to take the next step. Send a couple of times that work and I'll confirm. — ${name}`;
  }
  return swedish
    ? `Tack för att ni hör av er! Jag svarar gärna på era frågor — säg till vad ni vill veta. / ${name}`
    : `Thanks for reaching out — happy to answer your questions. Let me know what you'd like to know. — ${name}`;
}

export async function runTwin(input: TwinRunInput): Promise<TwinRunOutput> {
  const { kb, config, now } = input;
  const idGen = input.idGen ?? randomUUID;
  const nowIso = now.toISOString();
  const systemPrompt = buildSystemPrompt(kb, input.missingSlots);

  const approvals: ApprovalRequest[] = [];
  const alerts: CortexAlert[] = [];
  const writes: PipelineWrite[] = [];
  const needsDecision: string[] = [];

  // ── STEP 1 — INTAKE (dedupe within-run and against live applications) ──────
  const seen = new Set<string>();
  const unique: RoleFacts[] = [];
  for (const listing of input.listings) {
    const facts = parseListing(listing);
    const key = jobKey(facts);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(facts);
  }
  const found = unique.length;

  const toScore = unique.filter((f) => !input.state.liveApplicationKeys.has(appKey(f.company, f.role)));

  // ── STEP 2 — SCORE (the gate before any effort) ────────────────────────────
  interface Scored {
    facts: RoleFacts;
    result: ScoreResult;
  }
  const scored: Scored[] = toScore.map((facts) => ({
    facts,
    result: scoreRole(facts, kb, {
      threshold: config.threshold,
      weights: config.weights,
      salaryFloor: config.salaryFloor,
    }),
  }));

  const passing = scored
    .filter((s) => s.result.pass)
    .sort((a, b) => b.result.score - a.result.score);
  const discardedLowFit = scored.length - passing.length;

  // Job rows for every scored posting (idempotent). Staged ones get status later.
  const stagedKeys = new Set<string>();
  const toStage = passing.slice(0, config.maxStagedPerRun);
  for (const s of toStage) stagedKeys.add(jobKey(s.facts));

  // ── STEP 3+4 — TAILOR + STAGE (top passing, capped) ────────────────────────
  const topMatches: Digest["top_matches"] = [];
  for (const { facts, result } of toStage) {
    const channel = selectChannel(facts);
    const cvVariant = pickCvVariant(facts, kb);
    const screening = buildScreeningAnswers(facts, kb);
    const cover = await draftCoverLetter(facts, kb, { llm: input.llm, systemPrompt });
    const injection = detectInstructionInjection(facts.descriptionText);

    const missingFields = [
      ...screening.missing,
      ...(cvVariant ? [] : ["No CV variant configured in the KB"]),
      ...(cover.unbacked.length
        ? [`LLM draft cited unbacked numbers (${cover.unbacked.join(", ")}); used the KB-bound letter instead`]
        : []),
      ...(cover.neverClaim.length
        ? [`LLM draft touched a never-claim (${cover.neverClaim.join(", ")}); used the KB-bound letter instead`]
        : []),
      ...injection.map((i) => `Listing contains an instruction-injection attempt (ignored): "${i}"`),
    ];

    const approvalId = idGen();
    const applicationId = idGen();
    const action = actionOnApprove(channel.approvalType, channel.channel);

    approvals.push({
      id: approvalId,
      type: channel.approvalType,
      company: facts.company,
      role: facts.role,
      url: facts.url,
      channel: channel.channel,
      cv_variant: cvVariant,
      cover_letter: cover.text,
      screening_answers: screening.answers,
      missing_fields: missingFields,
      fit_score: result.score,
      action_on_approve: action,
    });

    writes.push({
      op: "insert",
      table: "applications",
      record: {
        id: applicationId,
        job_key: jobKey(facts),
        company: facts.company,
        role: facts.role,
        channel: channel.channel,
        cv_variant: cvVariant,
        status: "staged",
        fit_score: result.score,
        cover_letter: cover.text,
        screening: screening.answers,
        missing_fields: missingFields,
        approval_id: approvalId,
        followup_due: addDays(now, config.followUpAfterDays),
        created_at: nowIso,
      },
    });

    topMatches.push({
      company: facts.company,
      role: facts.role,
      fit_score: result.score,
      channel: channel.channel,
      why: result.reasons.slice(0, 3).join("; "),
      url: facts.url,
    });

    if (missingFields.length) {
      needsDecision.push(
        `${facts.company} — ${facts.role}: staged but needs ${missingFields.length} field(s) filled`,
      );
    }
  }

  // ── STEP 5 — TRACK: a job row for every scored posting ─────────────────────
  for (const { facts, result } of scored) {
    const key = jobKey(facts);
    const status = result.hardFilter
      ? "discarded"
      : !result.pass
        ? "discarded"
        : stagedKeys.has(key)
          ? "staged"
          : "scored";
    writes.push({
      op: "insert",
      table: "jobs",
      record: {
        job_key: key,
        source: facts.source,
        company: facts.company,
        role: facts.role,
        url: facts.url,
        location: facts.location,
        work_mode: facts.workMode,
        comp_min: facts.compMin,
        comp_currency: facts.compCurrency ?? null,
        fit_score: result.score,
        tier: result.tier,
        hard_filter: result.hardFilter,
        status,
        facts,
        reasons: result.reasons,
        scored_at: nowIso,
      },
    });
  }

  // ── STEP 6 — MONITOR & ROUTE (inbound replies) ─────────────────────────────
  for (const msg of input.inbound ?? []) {
    const c = classifyReply(msg);
    const swedish = isSwedish(msg.body);
    const company = msg.company ?? "(unknown)";
    const role = msg.role ?? "(unknown)";

    writes.push({
      op: "insert",
      table: "messages",
      record: {
        id: msg.id,
        application_id: msg.applicationId ?? null,
        direction: "inbound",
        kind: c.kind,
        subject: msg.subject ?? null,
        snippet: msg.body.slice(0, 280),
        from_addr: msg.from ?? null,
        signals: c.signals,
        classified_at: nowIso,
      },
    });

    if (c.kind === "offer") {
      alerts.push({
        priority: "critical",
        kind: "offer",
        company,
        role,
        summary: `Possible OFFER detected (${c.signals.join(", ")}).`,
        suggested_reply: holdingReply("offer", swedish, kb),
        requires: "Decide: accept / decline / negotiate. Do not respond autonomously.",
      });
      needsDecision.unshift(`OFFER — ${company} (${role}): review terms and decide.`);
    } else if (c.kind === "interview_request") {
      alerts.push({
        priority: "high",
        kind: "interview_request",
        company,
        role,
        summary: `Interview request detected (${c.signals.join(", ")}).`,
        suggested_reply: holdingReply("interview_request", swedish, kb),
        requires: "Approve a time slot — the twin will not confirm a calendar commitment autonomously.",
      });
      needsDecision.push(`INTERVIEW — ${company} (${role}): propose/confirm a time.`);
    } else if (c.kind === "recruiter_screen") {
      alerts.push({
        priority: "normal",
        kind: "recruiter_question",
        company,
        role,
        summary: `Recruiter screen / questions (${c.signals.join(", ")}).`,
        suggested_reply: holdingReply("recruiter_screen", swedish, kb),
        requires: "Review the drafted answers before sending.",
      });
    } else if (c.kind === "rejection") {
      alerts.push({
        priority: "normal",
        kind: "rejection",
        company,
        role,
        summary: `Rejection detected (${c.signals.join(", ")}). Logged; no reply needed.`,
        suggested_reply: "",
        requires: "None — logged to the pipeline.",
      });
    }
  }

  // Ghost follow-ups: ONE polite nudge per stalled high-fit application.
  for (const f of input.state.followupsDue ?? []) {
    const approvalId = idGen();
    approvals.push({
      id: approvalId,
      type: "send_followup",
      company: f.company,
      role: f.role,
      url: "",
      channel: f.channel,
      cv_variant: null,
      cover_letter:
        `Following up on my application for ${f.role} at ${f.company} (${f.daysWaiting} days ago) — ` +
        `still very interested and happy to share more. — ${kb.profile.preferredName}`,
      screening_answers: [],
      missing_fields: [],
      fit_score: 0,
      action_on_approve: actionOnApprove("send_followup", f.channel),
    });
    alerts.push({
      priority: "normal",
      kind: "ghost_followup",
      company: f.company,
      role: f.role,
      summary: `No reply after ${f.daysWaiting} days — one follow-up nudge drafted.`,
      suggested_reply: "(see the staged send_followup approval)",
      requires: "Approve the single follow-up nudge.",
    });
  }

  // ── STEP 7 — REPORT ────────────────────────────────────────────────────────
  if (input.missingSlots.length) {
    needsDecision.push(
      `KB has ${input.missingSlots.length} unfilled slot(s): ${input.missingSlots.slice(0, 6).join(", ")}` +
        (input.missingSlots.length > 6 ? " …" : ""),
    );
  }

  const digest: Digest = {
    run_at: nowIso,
    found,
    scored: scored.length,
    passed_threshold: passing.length,
    staged: toStage.length,
    submitted_prev_run: input.state.submittedPrevRun,
    needs_decision: needsDecision,
    top_matches: topMatches.slice(0, 5),
    discarded_low_fit: discardedLowFit,
  };

  const output: TwinRunOutput = {
    digest,
    approval_requests: approvals,
    cortex_alerts: alerts,
    pipeline_writes: writes,
  };

  // Guarantee the wire format before returning.
  return TwinRunOutputSchema.parse(output);
}
