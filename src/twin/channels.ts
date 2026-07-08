/**
 * The full channel taxonomy the engine is "ready" across. Two layers:
 *   • APPLICATION channels — where an application is submitted (ATS, company page,
 *     email via Gmail/Outlook, LinkedIn Easy Apply / external).
 *   • MESSAGE channels — where recruiter conversations happen (email, LinkedIn DM,
 *     WhatsApp).
 *
 * Every channel is PREPARED to the last click by the twin and handed off to Sphere
 * (the approved executor) for the final action. The twin never sends or logs in —
 * that boundary is the entire safety model. `channelReadiness()` is the concrete
 * answer to "is everything ready?": what the twin prepares and what Sphere executes.
 */
import type { ApprovalType } from "./contracts.js";
import type { AtsVendor } from "./facts.js";

export type EmailProvider = "gmail" | "outlook";
export type MessageChannelKind = "email" | "linkedin" | "whatsapp";

export type ChannelId =
  | `ats:${AtsVendor}`
  | "company_page"
  | `email:${EmailProvider}`
  | "linkedin:easy_apply"
  | "linkedin:external"
  | "linkedin:dm"
  | "whatsapp"
  | "unknown";

export type ChannelLayer = "application" | "message";

export interface ResolvedMessageChannel {
  id: ChannelId;
  approvalType: ApprovalType;
  handoff: string;
}

/**
 * Resolve the channel for a recruiter message/follow-up. Reply-on-the-same-channel
 * wins (a WhatsApp message is answered on WhatsApp); otherwise the configured
 * default. Email carries the mailbox provider.
 */
export function resolveMessageChannel(
  via: MessageChannelKind | undefined,
  config: { messageChannel: MessageChannelKind; emailProvider: EmailProvider },
  approvalType: ApprovalType = "send_followup",
): ResolvedMessageChannel {
  const kind = via ?? config.messageChannel;
  if (kind === "linkedin") {
    return { id: "linkedin:dm", approvalType, handoff: "Review the draft, then send the LinkedIn message." };
  }
  if (kind === "whatsapp") {
    return { id: "whatsapp", approvalType, handoff: "Review the draft, then send the WhatsApp message." };
  }
  const id: ChannelId = `email:${config.emailProvider}`;
  return { id, approvalType, handoff: `Review the draft, then send the email (${config.emailProvider}).` };
}

export interface ChannelReadiness {
  channel: string;
  layer: ChannelLayer;
  /** What the twin stages, to the last click. */
  prepares: string;
  /** The approval type queued for Svee. */
  approvalType: ApprovalType;
  /** The exact action Sphere performs on approval (never the twin). */
  sphereExecutes: string;
}

/**
 * The readiness matrix — every channel the engine can prepare, and the single
 * action Sphere must perform to complete it. This is the contract Sphere wires to.
 */
export function channelReadiness(): ChannelReadiness[] {
  return [
    { channel: "ats:greenhouse|lever|ashby|teamtailor|workday", layer: "application", prepares: "the full staged form (answers + CV variant)", approvalType: "submit_application", sphereExecutes: "click the final Submit on the ATS" },
    { channel: "company_page", layer: "application", prepares: "the staged career-page form", approvalType: "submit_application", sphereExecutes: "click the final Submit on the career page" },
    { channel: "email:gmail", layer: "application", prepares: "the drafted email + CV attachment (Gmail)", approvalType: "send_email", sphereExecutes: "send the Gmail draft" },
    { channel: "email:outlook", layer: "application", prepares: "the drafted email + CV attachment (Outlook)", approvalType: "send_email", sphereExecutes: "send the Outlook draft" },
    { channel: "linkedin:easy_apply", layer: "application", prepares: "the full Easy Apply answer set", approvalType: "linkedin_easy_apply", sphereExecutes: "tap through Easy Apply and submit (never automate login)" },
    { channel: "linkedin:external", layer: "application", prepares: "the resolved external ATS form", approvalType: "submit_application", sphereExecutes: "click the final Submit on the linked ATS" },
    { channel: "email:gmail|outlook", layer: "message", prepares: "the drafted reply/follow-up", approvalType: "send_followup", sphereExecutes: "send the email reply" },
    { channel: "linkedin:dm", layer: "message", prepares: "the drafted LinkedIn message", approvalType: "send_followup", sphereExecutes: "send the LinkedIn message (never automate login)" },
    { channel: "whatsapp", layer: "message", prepares: "the drafted WhatsApp message", approvalType: "send_followup", sphereExecutes: "send the WhatsApp message" },
  ];
}
