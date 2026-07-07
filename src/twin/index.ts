/**
 * Public API surface for the SVEE//TWIN job-application agent.
 */
export { loadTwinConfig } from "./config.js";
export type { TwinConfig, LoadTwinConfigOptions } from "./config.js";

export { loadKb, evaluateKb, collectMissingSlots } from "./kb.js";
export type { LoadedKb } from "./kb.js";
export { KnowledgeBaseSchema } from "./kb.schema.js";
export type { KnowledgeBase } from "./kb.schema.js";
export { SVEE_KB } from "./kb.data.js";

export {
  scoreRole,
  hardFilter,
  classifyFamily,
  kbSkillTokens,
  normalizeSkill,
  DEFAULT_WEIGHTS,
} from "./scoring.js";
export type { ScoreResult, ScoreBreakdown, ScoringWeights, Tier, FamilyBucket } from "./scoring.js";

export { selectChannel, detectAtsVendor } from "./channel.js";
export type { ChannelDecision } from "./channel.js";

export { resolveMessageChannel, channelReadiness } from "./channels.js";
export type {
  ChannelId,
  ChannelLayer,
  EmailProvider,
  MessageChannelKind,
  ChannelReadiness,
  ResolvedMessageChannel,
} from "./channels.js";

export { StagingSphere, planFromApproval } from "./sphere.js";
export type { SphereExecutor, ExecutionPlan, SphereContext, ExecutionResult } from "./sphere.js";

export {
  HARD_STOP_ACTIONS,
  AUTONOMOUS_SAFE,
  isHardStop,
  requiresApproval,
  actionOnApprove,
  guardExecution,
  ApprovalRequiredError,
  detectInstructionInjection,
} from "./guardrails.js";
export type { ExecutableApproval, Handoff, ApprovalStatus } from "./guardrails.js";

export { classifyReply, isSwedish } from "./inbox.js";
export type { InboundMessage, ReplyClassification, ReplyKind } from "./inbox.js";

export {
  pickCvVariant,
  pickFamilyKind,
  deterministicCoverLetter,
  draftCoverLetter,
  buildScreeningAnswers,
  unbackedMetrics,
  neverClaimViolations,
  kbNumberTokens,
  wordCount,
} from "./tailor.js";
export type { CoverLetterResult, ScreeningResult, FamilyKind } from "./tailor.js";

export { buildSystemPrompt, renderKb, PERSONA } from "./prompt.js";
export { createLlm, DryRunLlm, AnthropicLlm } from "./llm.js";
export type { LlmClient, LlmCompleteOptions } from "./llm.js";

export { runTwin } from "./loop.js";
export type { TwinRunInput, FollowupDue } from "./loop.js";

export {
  parseListing,
  extractSkills,
  pastedSource,
  boardSource,
  staticSource,
  collectListings,
  greenhouseFetcher,
  leverFetcher,
  buildFetcher,
} from "./sources/index.js";
export type { RawListing, SourceAdapter, BoardFetcher } from "./sources/index.js";

export * from "./contracts.js";
export type { RoleFacts } from "./facts.js";
export { jobKey } from "./facts.js";

export {
  createTwinDatabase,
  applyTwinSchema,
  applyPipelineWrites,
  insertApprovals,
  insertDigest,
  upsertKbSnapshot,
  liveApplicationKeys,
  previousDigestRunAt,
  countSubmittedSince,
  dueFollowups,
  pendingApprovals,
  latestDigest,
} from "./store.js";
