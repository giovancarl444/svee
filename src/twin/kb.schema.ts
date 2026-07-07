/**
 * The KNOWLEDGE BASE schema — the twin's entire factual world (spec §2).
 *
 * Everything the twin asserts about Svee comes from a value validated here and
 * nowhere else. The zod schema pins the SHAPE; the loader (kb.ts) additionally
 * flags any leaf that is still an unfilled `<<slot>>` so an untuned KB surfaces
 * as `needs_decision` instead of leaking a placeholder into an application.
 */
import { z } from "zod";

/** Whether a project/venture is actually shipped — the twin must never overstate. */
export const ShippedState = z.enum(["live", "prototype", "spec"]);
export type ShippedState = z.infer<typeof ShippedState>;

export const CvFamily = z.enum(["A", "B", "C"]);
export type CvFamily = z.infer<typeof CvFamily>;

export const ProfileSchema = z.object({
  fullName: z.string(),
  preferredName: z.string(),
  pronouns: z.string().optional().default(""),
  /** The address recruiters should reach — confirm before going live. */
  email: z.string(),
  phone: z.string().optional().default(""),
  location: z.string(),
  /** State plainly, e.g. "Swedish citizen / EU right to work". */
  workAuthorization: z.string(),
  linkedinUrl: z.string().optional().default(""),
  githubUrl: z.string().optional().default(""),
  personalSite: z.string().optional().default(""),
  availability: z.string(),
  willingToRelocate: z.string(),
  /** Cities/regions Svee WOULD relocate to (for the on-site hard filter). */
  relocateTo: z.array(z.string()).default([]),
  workModePreference: z.string().default("Remote-first > hybrid > on-site"),
  driversLicense: z.string().default("No"),
  /** Credentials Svee actually holds (degrees, licenses, clearances). */
  credentials: z.array(z.string()).default([]),
  militaryNote: z.string().optional().default(""),
  /** Disclosure policy for the pending military application (affects availability answers). */
  discloseMilitary: z.boolean().default(false),
});

export const TargetRolesSchema = z.object({
  primary: z.array(z.string()),
  alsoAcceptable: z.array(z.string()).default([]),
  notRoles: z.array(z.string()).default([]),
  seniorityBand: z.array(z.enum(["intern", "junior", "mid", "senior", "lead", "founding"])).default([]),
  keywords: z.array(z.string()).default([]),
});

export const ExperienceEntrySchema = z.object({
  title: z.string(),
  org: z.string(),
  dates: z.string(),
  scope: z.string(),
  shipped: ShippedState,
  bullets: z.array(z.string()),
});

export const SkillsSchema = z.object({
  expert: z.array(z.string()).default([]),
  strong: z.array(z.string()).default([]),
  working: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
});

export const CvVariantSchema = z.object({
  id: CvFamily,
  family: z.string(),
  /** A link or the pasted content. */
  content: z.string(),
});

export const LetterComponentsSchema = z.object({
  /** Opening hooks keyed by role family (e.g. "fullstack", "agents", "growth"). */
  hooks: z.record(z.string(), z.string()).default({}),
  proofFullStack: z.string(),
  proofAgents: z.string(),
  proofGrowth: z.string(),
  workingStyle: z.string(),
  close: z.string(),
});

export const ScreeningAnswersSchema = z.object({
  salaryExpectation: z.string(),
  salaryFloor: z.string(),
  noticePeriod: z.string(),
  visaSponsorshipNeeded: z.boolean().default(false),
  whyNow: z.string(),
  relocation: z.string(),
  remoteSetup: z.string(),
  tellMeAboutYourself: z.string(),
  /** Things the twin must NEVER put on a form (crypto holdings, health, ...). */
  neverDisclose: z.array(z.string()).default([]),
});

export const PreferencesSchema = z.object({
  mustHaves: z.array(z.string()).default([]),
  niceToHaves: z.array(z.string()).default([]),
  /** Industries/companies Svee refuses — an auto-reject hard filter. */
  dealbreakers: z.array(z.string()).default([]),
  hoursConstraints: z.string().optional().default(""),
  /** Explicit list of claims the twin must never assert. */
  neverClaim: z.array(z.string()).default([]),
});

export const SourceSchema = z.object({
  name: z.string(),
  kind: z.enum(["linkedin", "ats", "board", "company_page", "feed"]),
  url: z.string().optional().default(""),
  query: z.string().optional().default(""),
});

export const KnowledgeBaseSchema = z.object({
  /** Bump when the factual world changes so digests are attributable. */
  version: z.string().default("0.0.0"),
  profile: ProfileSchema,
  narrative: z.string(),
  targetRoles: TargetRolesSchema,
  experience: z.array(ExperienceEntrySchema).default([]),
  skills: SkillsSchema,
  /** The ONLY numbers the twin may cite. If a number isn't here, it doesn't exist. */
  achievementBank: z.array(z.string()).default([]),
  cvVariants: z.array(CvVariantSchema).default([]),
  letterComponents: LetterComponentsSchema,
  screeningAnswers: ScreeningAnswersSchema,
  preferences: PreferencesSchema,
  sources: z.array(SourceSchema).default([]),
});

export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>;
export type Skills = z.infer<typeof SkillsSchema>;
export type LetterComponents = z.infer<typeof LetterComponentsSchema>;
export type ScreeningAnswers = z.infer<typeof ScreeningAnswersSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type CvVariant = z.infer<typeof CvVariantSchema>;
