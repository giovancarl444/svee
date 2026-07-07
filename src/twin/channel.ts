/**
 * CHANNEL LOGIC (spec §"CHANNEL LOGIC"). Prefer the channel with the least
 * friction and least ToS risk:
 *   1. Direct company career page / ATS (Greenhouse, Lever, Ashby, Workday,
 *      Teamtailor) — preferred; stage the form.
 *   2. Email application — draft + attach the right CV variant.
 *   3. LinkedIn Easy Apply — human-approved only; never automate login/submit.
 *   4. LinkedIn external link — follow to the real ATS and use #1.
 * Never scrape behind logins; never bulk-automate submissions.
 */
import type { ApprovalType } from "./contracts.js";
import type { AtsVendor, RoleFacts } from "./facts.js";

export interface ChannelDecision {
  /** Human label used in the digest and approval request. */
  channel: string;
  approvalType: ApprovalType;
  atsVendor?: AtsVendor;
  note: string;
}

const ATS_HOST_VENDOR: Array<[RegExp, AtsVendor]> = [
  [/greenhouse\.io|boards\.greenhouse/i, "greenhouse"],
  [/lever\.co/i, "lever"],
  [/ashbyhq\.com/i, "ashby"],
  [/myworkdayjobs\.com|workday/i, "workday"],
  [/teamtailor\.com/i, "teamtailor"],
];

/** Infer an ATS vendor from a URL host when the adapter didn't set one. */
export function detectAtsVendor(url: string): AtsVendor | undefined {
  for (const [re, vendor] of ATS_HOST_VENDOR) if (re.test(url)) return vendor;
  return undefined;
}

export function selectChannel(
  facts: RoleFacts,
  opts: { emailProvider?: "gmail" | "outlook" } = {},
): ChannelDecision {
  const vendor = facts.atsVendor ?? detectAtsVendor(facts.url);
  const provider = opts.emailProvider ?? "gmail";

  switch (facts.applyMethod) {
    case "ats":
    case "company_page":
      return {
        channel: vendor ? `ats:${vendor}` : "company_page",
        approvalType: "submit_application",
        ...(vendor ? { atsVendor: vendor } : {}),
        note: "Stage the form on the ATS/career page; Svee taps submit.",
      };
    case "email":
      return {
        channel: `email:${provider}`,
        approvalType: "send_email",
        note: facts.applyEmail
          ? `Draft the email (${provider}) to ${facts.applyEmail} with the CV variant attached.`
          : `Draft the application email (${provider}) with the CV variant attached (address TBD).`,
      };
    case "linkedin_easy_apply":
      return {
        channel: "linkedin_easy_apply",
        approvalType: "linkedin_easy_apply",
        note: "Prepare the full answer set; Svee taps through Easy Apply. Never automate login/submit.",
      };
    case "linkedin_external":
      return {
        channel: vendor ? `ats:${vendor} (via LinkedIn)` : "ats (via LinkedIn)",
        approvalType: "submit_application",
        ...(vendor ? { atsVendor: vendor } : {}),
        note: "Follow the LinkedIn external link to the real ATS and stage the form there.",
      };
    default:
      return {
        channel: vendor ? `ats:${vendor}` : "unknown",
        approvalType: "submit_application",
        ...(vendor ? { atsVendor: vendor } : {}),
        note: "Apply method unclear — locate the real application form before staging.",
      };
  }
}
