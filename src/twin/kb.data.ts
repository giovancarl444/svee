/**
 * The bundled Knowledge Base for Svee.
 *
 * TRUTH DISCIPLINE: this file contains only what the spec states as fact plus
 * what is verifiable from this repository (e.g. the impact.com integration and
 * its 78-test suite). Genuinely-unknown personal data — contact email, phone,
 * profile URLs, salary numbers, notice period — is left as an explicit `<<slot>>`
 * so the loader flags it for a human instead of the twin inventing it. Project
 * `shipped` states are deliberately conservative: nothing is marked "live" unless
 * it is actually running in production. Interview-defensibility over polish.
 *
 * Swap this out (or set TWIN_KB_PATH) once the real slots are confirmed.
 */
import type { KnowledgeBase } from "./kb.schema.js";

export const SVEE_KB: KnowledgeBase = {
  version: "0.1.0",

  profile: {
    fullName: "Ellit Svee",
    preferredName: "Svee",
    pronouns: "",
    email: "<<applications email — confirm: ellit.svee@gmail.com?>>",
    phone: "<<+46 phone number>>",
    location: "Sollentuna, Stockholm, Sweden",
    workAuthorization: "Swedish/EU right to work — no visa or sponsorship required",
    linkedinUrl: "<<LinkedIn profile URL>>",
    githubUrl: "<<GitHub / portfolio URL>>",
    personalSite: "<<public-facing site — rox.com? confirm which is live>>",
    availability: "<<notice / start date — immediate or 2 weeks?>>",
    willingToRelocate: "Not relocating; hybrid in the Stockholm area is fine, otherwise remote",
    relocateTo: ["Stockholm", "Sollentuna"],
    workModePreference: "Remote-first (autonomous) > hybrid (Stockholm) > on-site",
    driversLicense: "No (A1 motorcycle licence in progress, summer 2026)",
    credentials: [], // No formal degree/clearance — drives the mandatory-credential hard filter.
    militaryNote:
      "Pending Jägarsoldat application at I 19 Arvidsjaur — may affect availability if it proceeds.",
    discloseMilitary: false, // Internal-only; not volunteered on application forms.
  },

  narrative:
    "Solo full-stack operator who ships production-grade systems end to end — " +
    "TypeScript/Next.js on Supabase/Postgres and Vercel, with AI-agent orchestration and " +
    "crypto-native billing. I've built a typed, resilient affiliate-tracking integration " +
    "(retrying HTTP client, idempotent warehouse, mobile-first dashboard) and autonomous " +
    "lead-gen and job-application agents — without a team. I own the whole stack, move fast, " +
    "and optimize for shipped outcomes over activity.",

  targetRoles: {
    primary: [
      "Full-stack engineer",
      "AI / agent engineer",
      "Growth engineer",
      "Founding engineer",
      "Automation / RevOps engineer",
    ],
    alsoAcceptable: ["Backend engineer", "Platform engineer", "Developer advocate (technical)"],
    notRoles: ["Pure manual QA", "On-site IT support", "Non-technical sales"],
    seniorityBand: ["junior", "mid", "founding"],
    keywords: [
      "TypeScript",
      "Next.js",
      "React",
      "Node.js",
      "Supabase",
      "Postgres",
      "Vercel",
      "Cloudflare Workers",
      "AI agents",
      "LLM",
      "Claude",
      "automation",
      "Stripe",
      "crypto payments",
      "growth",
      "affiliate",
      "martech",
      "GitHub Actions",
    ],
  },

  experience: [
    {
      title: "Founder / Solo Operator",
      org: "Svee (independent)",
      dates: "2023 – present",
      scope: "Design, build, and run full-stack products and automation agents solo.",
      shipped: "prototype",
      bullets: [
        "Built a production-grade, typed integration layer for the impact.com affiliate " +
          "platform: a versioned HTTP client with retry/backoff/jitter and Retry-After handling, " +
          "deferred-export submit→poll→download, and idempotent Postgres upserts — 78 passing " +
          "unit tests (mocked HTTP) plus a real-Postgres (PGlite) integration suite.",
        "Modelled a persona-aware analytics warehouse and a mobile-first dashboard (8-tile KPI " +
          "grid, action-state funnel, SubId1/Shopify tracking, daily revenue+clicks trend) on " +
          "Supabase and Vercel, scheduled by a GitHub Actions nightly cron.",
        "Shipped a postback/webhook receiver with signature verification, replay dedupe, and " +
          "GDPR-aware PII hashing (no raw PII in logs or repo).",
      ],
    },
    {
      title: "Builder — autonomous agents & pipelines",
      org: "Svee (independent)",
      dates: "2024 – present",
      scope: "AI-agent orchestration for lead-gen and job applications.",
      shipped: "prototype",
      bullets: [
        "Designed an autonomous lead-gen pipeline: pluggable source adapters, a PageSpeed audit " +
          "engine, Claude-powered copy generation, and a GitHub Actions cron writing to Supabase.",
        "Built a job-application digital twin (this system): deterministic fit-scoring gate, " +
          "KB-bound tailoring, and an approval-queue safety model that stops at every irreversible " +
          "action.",
      ],
    },
  ],

  skills: {
    expert: ["TypeScript", "Next.js", "React", "Node.js", "Supabase", "Postgres", "Vercel"],
    strong: [
      "Cloudflare Workers",
      "Tailwind CSS",
      "prompt engineering",
      "Claude / Claude Code",
      "Stripe",
      "crypto billing",
      "GitHub Actions",
      "zod",
      "REST integration",
    ],
    working: ["Python", "SQL", "Solana tooling", "Monero tooling"],
    domains: [
      "affiliate / martech",
      "AI-agent orchestration",
      "growth automation",
      "e-commerce / Shopify",
      "data pipelines",
    ],
    languages: ["Swedish (native)", "English (fluent)"],
  },

  // The ONLY numbers/artifacts the twin may cite. No new numbers beyond these.
  achievementBank: [
    "Built a typed, resilient impact.com integration layer (retry/backoff/jitter + Retry-After, " +
      "deferred-export polling, idempotent upserts) — 78 passing unit tests with mocked HTTP.",
    "Added a real-Postgres integration suite (PGlite, in-process) that runs the schema, upserts, " +
      "metrics CTEs, retention purge, and webhook handler against Postgres — caught and fixed a SQL bug.",
    "Modelled a persona-aware analytics warehouse + mobile-first dashboard: 8-tile KPI grid " +
      "(approved revenue, pending value, EPC, conversion rate, clicks, actions, payout, reversal rate).",
    "Shipped a postback/webhook receiver with signature verification, replay dedupe, and GDPR-aware " +
      "email hashing (no raw PII in logs or the repo).",
    "Deployed always-up hosting: Supabase warehouse, Vercel functions + static dashboard, GitHub " +
      "Actions nightly cron (sync → snapshot → reconcile).",
    "Designed an autonomous lead-gen pipeline: pluggable source adapters, PageSpeed audit engine, " +
      "Claude-powered copy generation, GitHub Actions cron, Supabase + Vercel.",
    "Core stack: TypeScript, Next.js, React, Supabase/Postgres, Vercel, Cloudflare Workers, " +
      "GitHub Actions. Languages: Swedish (native), English (fluent).",
  ],

  cvVariants: [
    {
      id: "A",
      family: "Full-stack / product engineer",
      content:
        "Tailored from the KB — full-stack/product emphasis: impact.com integration, warehouse + " +
        "dashboard, end-to-end ownership. (Attach the real PDF or link here.)",
    },
    {
      id: "B",
      family: "AI / agent / automation engineer",
      content:
        "Tailored from the KB — agents/automation emphasis: lead-gen pipeline, this job-application " +
        "twin, Claude Code orchestration. (Attach the real PDF or link here.)",
    },
    {
      id: "C",
      family: "Growth / RevOps / martech engineer",
      content:
        "Tailored from the KB — growth/martech emphasis: affiliate tracking, SubId attribution, " +
        "Shopify, automated outreach. (Attach the real PDF or link here.)",
    },
  ],

  letterComponents: {
    hooks: {
      fullstack:
        "I build and run full-stack systems end to end, so a team that values shipping over " +
        "hand-offs is where I do my best work.",
      agents:
        "I've been building autonomous agents (lead-gen, and this very job-application twin) with " +
        "Claude Code — orchestration with real guardrails, not demos.",
      growth:
        "I've shipped the plumbing behind growth: affiliate tracking, attribution by SubId, and " +
        "automated outreach that actually runs on a cron.",
    },
    proofFullStack:
      "I built a typed, resilient impact.com integration layer — a retrying HTTP client, " +
      "deferred-export polling, and idempotent Postgres upserts — backed by 78 unit tests and a " +
      "real-Postgres integration suite, then wired it to a Supabase warehouse and a Vercel dashboard.",
    proofAgents:
      "I built an autonomous lead-gen pipeline (pluggable adapters, PageSpeed audits, Claude-powered " +
      "copy, GitHub Actions cron on Supabase) and a job-application agent with a hard approval gate " +
      "at every irreversible step.",
    proofGrowth:
      "I shipped affiliate/martech plumbing end to end: SubId1 attribution for Shopify placements, " +
      "an action-state funnel, and a postback receiver with signature verification and dedupe.",
    workingStyle:
      "Remote-first, autonomous, outcome-driven. I own the whole stack and ship fast.",
    close: "Happy to walk through any of these builds live. — Svee",
  },

  screeningAnswers: {
    salaryExpectation: "<<target comp range>>",
    salaryFloor: "<<hard salary floor>>",
    noticePeriod: "<<notice period>>",
    visaSponsorshipNeeded: false,
    whyNow:
      "I've been building production systems solo and want to do the same inside a team that ships " +
      "fast and owns outcomes.",
    relocation: "Remote-first; hybrid in the Stockholm area is fine; not relocating elsewhere.",
    remoteSetup: "Stockholm-based, own equipment, security-conscious setup (GrapheneOS/Pixel).",
    tellMeAboutYourself:
      "I'm a 20-year-old solo full-stack operator from Stockholm. I ship production systems end to " +
      "end — TypeScript/Next.js on Supabase and Vercel — and build AI agents for automation. Most " +
      "recently a typed impact.com affiliate integration with a warehouse and dashboard, and " +
      "autonomous lead-gen and job-application agents.",
    neverDisclose: ["crypto holdings", "health information", "exact home address"],
  },

  preferences: {
    mustHaves: ["Remote or hybrid-Stockholm", "async-friendly", "ships fast", "real ownership"],
    niceToHaves: ["crypto / AI domain", "small team", "equity", "modern TS stack"],
    // Short, matchable industry/term tokens (separators are normalized on match).
    dealbreakers: ["unpaid", "commission-only", "data broker", "payday loan", "gambling"],
    hoursConstraints: "",
    neverClaim: [
      "a formal CS or university degree",
      "professional employment at any company that never employed him",
      "years of experience he does not have",
      "any security clearance or professional certification",
      "a driver's licence",
    ],
  },

  sources: [
    {
      name: "LinkedIn — remote TS/full-stack (Sweden/EU)",
      kind: "linkedin",
      url: "",
      query: "https://www.linkedin.com/jobs/search/?keywords=full-stack%20typescript&location=Sweden&f_WT=2",
    },
    {
      name: "Wellfound (AngelList) — founding/full-stack, remote",
      kind: "board",
      url: "https://wellfound.com/role/full-stack-engineer",
      query: "remote founding engineer typescript",
    },
    // Watched company ATS boards (public JSON — fetched automatically with `--fetch`).
    // Replace the placeholder token/company with a real board you're watching.
    {
      name: "Watched Greenhouse board (replace token)",
      kind: "ats",
      url: "",
      query: "greenhouse:your-company-token",
    },
    {
      name: "Watched Lever board (replace company)",
      kind: "ats",
      url: "",
      query: "lever:your-company",
    },
    {
      name: "Arbetsförmedlingen (Platsbanken)",
      kind: "board",
      url: "https://arbetsformedlingen.se/platsbanken/annonser?q=utvecklare%20typescript",
      query: "utvecklare typescript remote",
    },
    {
      name: "thelocal.se / EU remote boards",
      kind: "feed",
      url: "",
      query: "remote typescript engineer EU",
    },
  ],
};
