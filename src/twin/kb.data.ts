/**
 * The bundled Knowledge Base for Elliot Svee — populated from his real CV
 * (Elliot_CV_Engelska.pdf) plus the one technical project verifiable in this
 * repository (the impact.com affiliate integration).
 *
 * TRUTH DISCIPLINE: every claim here is stated on the CV or verifiable in-repo.
 * The genuinely-unknown facts the CV doesn't give — LinkedIn URL, salary
 * floor/target, notice period, start date — are left as explicit `<<slot>>`s so
 * the loader flags them instead of the twin inventing them. `shipped` states are
 * conservative. There is NO university degree (upper-secondary/gymnasium only),
 * which the mandatory-credential hard filter relies on. Interview-defensibility
 * over polish.
 *
 * Positioning reflects the real person: an e-commerce / growth / CRO / digital-
 * marketing operator with AI-tooling and web-development ability — not a pure
 * software engineer.
 */
import type { KnowledgeBase } from "./kb.schema.js";

export const SVEE_KB: KnowledgeBase = {
  version: "0.2.0",

  profile: {
    fullName: "Elliot Carl Svee",
    preferredName: "Elliot",
    pronouns: "",
    email: "elliot.svee@outlook.com",
    phone: "+46 73 543 31 57",
    location: "Sollentuna, Stockholm, Sweden",
    workAuthorization: "Swedish/EU right to work — no visa or sponsorship required",
    linkedinUrl: "<<LinkedIn profile URL>>",
    githubUrl: "",
    personalSite: "",
    availability: "<<start date / notice — immediate?>>",
    willingToRelocate: "Based in Sollentuna (Stockholm); open to hybrid in the Stockholm area, otherwise remote",
    relocateTo: ["Stockholm", "Sollentuna"],
    workModePreference: "Remote-first > hybrid (Stockholm) > on-site",
    driversLicense: "No",
    credentials: [], // Upper-secondary (gymnasium) only — no university degree.
    militaryNote: "",
    discloseMilitary: false,
  },

  narrative:
    "Entrepreneurial e-commerce and growth operator. Since 2020 I've founded and run online brands " +
    "and agencies — driving CRO, paid social (Meta/TikTok), copywriting, and web development end to " +
    "end. I build and use my own AI tools for media generation and marketing automation (currently " +
    "generating AI media for Burberry), and I ship technical work too — a production-grade, typed " +
    "affiliate-tracking integration on Supabase/Vercel. I move fast, own the full funnel, and optimize " +
    "for outcomes.",

  targetRoles: {
    primary: [
      "Growth engineer",
      "CRO / conversion optimization specialist",
      "Digital marketing / paid social",
      "E-commerce specialist",
      "Marketing automation / martech",
      "AI for marketing / AI media",
    ],
    alsoAcceptable: [
      "Founding team (growth / ops)",
      "Web developer (frontend / no-code)",
      "Automation engineer",
      "Developer advocate",
    ],
    notRoles: ["Pure manual QA", "On-site IT support", "Cold-call telesales"],
    seniorityBand: ["junior", "mid", "founding"],
    keywords: [
      "CRO",
      "conversion rate optimization",
      "e-commerce",
      "Shopify",
      "dropshipping",
      "Meta ads",
      "Facebook ads",
      "Instagram",
      "TikTok ads",
      "paid social",
      "digital marketing",
      "copywriting",
      "funnel",
      "A/B testing",
      "analytics",
      "growth",
      "affiliate",
      "martech",
      "AI tools",
      "AI media generation",
      "marketing automation",
      "web development",
      "TypeScript",
      "Next.js",
      "Supabase",
      "Vercel",
      "graphic design",
      "UX",
      "customer support",
    ],
  },

  education: ["Rudbeck Gymnasium — Economics & Business Development (2022–2025), upper-secondary"],

  experience: [
    {
      title: "E-commerce & Marketing Specialist",
      org: "L8Hasselblad",
      dates: "2026 (8 months, full-time)",
      scope: "Broad e-commerce & marketing remit.",
      shipped: "live",
      bullets: [
        "CRO improvements, web development, and customer relations across a broad marketing remit — " +
          "conversion optimization, on-site changes, and all kinds of marketing.",
      ],
    },
    {
      title: "AI — Media Generation (part-time)",
      org: "Burberry",
      dates: "2026 (part-time)",
      scope: "AI media generation for a luxury fashion brand.",
      shipped: "live",
      bullets: [
        "Generate AI media for one of the world's leading luxury fashion brands using my own AI " +
          "experience and self-built AI tools to maximize results.",
      ],
    },
    {
      title: "Founder — Website Optimization Agency",
      org: "Svee Performance",
      dates: "2024–2025",
      scope: "Website performance, UX, and conversion-rate optimization.",
      shipped: "live",
      bullets: [
        "Founded an agency specializing in website performance, UX, and CRO — full-funnel optimization, " +
          "product descriptions, and graphic design, from strategy and analysis to technical execution " +
          "and client relations.",
      ],
    },
    {
      title: "Co-Founder & Marketing — Digital Marketing Agency",
      org: "E-Flow Media",
      dates: "2023–2024",
      scope: "Social-media marketing agency.",
      shipped: "live",
      bullets: [
        "Co-founded a social-media marketing agency: audience analysis, content strategy, ad management, " +
          "and performance tracking across Facebook, Instagram, and TikTok.",
      ],
    },
    {
      title: "Co-Founder & Marketing — E-Commerce & Dropshipping",
      org: "Silver Valley AB",
      dates: "2020–2024",
      scope: "Built and grew multiple e-commerce brands.",
      shipped: "live",
      bullets: [
        "Initiated and grew several e-commerce brands end to end — product analysis, website development, " +
          "digital marketing, ad editing, graphic design, photography, and copywriting; several became " +
          "successful stores within 1–2 years.",
      ],
    },
    {
      title: "Co-Founder & Mentor — E-commerce Education",
      org: "Mediocrity Misfits",
      dates: "2022–2023",
      scope: "Education program for young entrepreneurs.",
      shipped: "live",
      bullets: [
        "Launched an education program supporting young entrepreneurs in building and running their own " +
          "e-commerce businesses (daily tasks, follow-ups, personal coaching) — grew to over 4,000 active " +
          "members in just two months.",
      ],
    },
    {
      title: "Builder — impact.com affiliate integration (technical project)",
      org: "Svee (independent, this repository)",
      dates: "2025–present",
      scope: "Production-grade affiliate-tracking integration + warehouse + dashboard.",
      shipped: "prototype",
      bullets: [
        "Built a typed, resilient impact.com integration: a retrying HTTP client (backoff/jitter + " +
          "Retry-After), idempotent Postgres upserts, a persona-aware analytics dashboard on Supabase/" +
          "Vercel, and a GitHub Actions cron — 78 passing unit tests (plus a real-Postgres integration suite).",
      ],
    },
  ],

  skills: {
    expert: [
      "CRO / conversion optimization",
      "Digital marketing",
      "Meta / Facebook & TikTok ads",
      "Copywriting",
      "E-commerce (Shopify / dropshipping)",
      "Graphic design",
    ],
    strong: [
      "Web development",
      "AI tooling / AI media generation",
      "Marketing automation",
      "Analytics & A/B testing",
      "Content strategy",
      "UX",
      "Customer support",
      "TypeScript",
      "Next.js",
      "Supabase",
      "Vercel",
    ],
    working: ["Postgres", "Python", "affiliate / martech integration", "photography"],
    domains: [
      "e-commerce / DTC",
      "digital marketing / paid social",
      "CRO / growth",
      "AI for marketing",
      "martech / affiliate",
    ],
    languages: ["Swedish (native)", "English (fluent)"],
  },

  // The ONLY numbers/facts the twin may cite. All are stated on the CV or verifiable in-repo.
  achievementBank: [
    "Grew an e-commerce education program (Mediocrity Misfits) to over 4,000 active members in just two months.",
    "8 months full-time as E-commerce & Marketing Specialist at L8Hasselblad — CRO, web development, customer relations.",
    "Generate AI media for Burberry (a leading luxury fashion brand) using self-built AI tools.",
    "Founded Svee Performance, a website-optimization agency — full-funnel CRO, UX, and graphic design.",
    "Grew several e-commerce brands to successful stores within 1–2 years (Silver Valley AB).",
    "Co-founded E-Flow Media, running paid social across Facebook, Instagram, and TikTok — audience analysis, content strategy, ad management, performance tracking.",
    "Built a production-grade impact.com affiliate integration (typed, resilient HTTP client + idempotent Postgres upserts + Supabase/Vercel dashboard) — 78 passing unit tests.",
    "Core stack: CRO, Meta/TikTok ads, copywriting, e-commerce, web development, AI tooling; TypeScript/Supabase/Vercel. Swedish (native), English (fluent).",
  ],

  cvVariants: [
    {
      id: "A",
      family: "Growth / CRO / e-commerce",
      content:
        "Tailored from the master CV — growth/CRO/e-commerce emphasis: Svee Performance, L8Hasselblad, " +
        "Silver Valley. (Attach the tailored CV export.)",
    },
    {
      id: "B",
      family: "AI / automation / martech",
      content:
        "Tailored from the master CV — AI/automation emphasis: Burberry AI media, self-built AI tools, " +
        "the impact.com integration, marketing automation. (Attach the tailored CV export.)",
    },
    {
      id: "C",
      family: "Digital marketing / paid social",
      content:
        "Tailored from the master CV — paid-social/marketing emphasis: E-Flow Media, Meta/TikTok ad " +
        "management, content strategy, copywriting. (Attach the tailored CV export.)",
    },
  ],

  letterComponents: {
    hooks: {
      growth:
        "I've founded and run e-commerce brands and agencies since 2020 — CRO, paid social, and the full " +
        "funnel — so growth that's owned end to end is where I do my best work.",
      agents:
        "I build and use my own AI tools for media and marketing (currently generating AI media for " +
        "Burberry) — practical AI that ships results, not demos.",
      fullstack:
        "I ship technical work too — a typed, production-grade affiliate-tracking integration on " +
        "Supabase/Vercel — alongside the marketing and CRO.",
    },
    proofGrowth:
      "I grew an e-commerce education program to over 4,000 active members in two months, founded a CRO " +
      "agency (Svee Performance), and run paid social across Meta and TikTok — audience analysis, content, " +
      "and performance tracking.",
    proofAgents:
      "I generate AI media for Burberry with my own AI tools, and I build marketing-automation and " +
      "affiliate tooling — AI applied to real growth work, not demos.",
    proofFullStack:
      "I built a production-grade, typed affiliate-tracking integration for impact.com — a resilient HTTP " +
      "client, idempotent Postgres upserts, and a Supabase/Vercel dashboard, backed by 78 unit tests.",
    workingStyle:
      "Entrepreneurial, fast under deadlines, outcome-driven — I own the full funnel and strive for perfection.",
    close: "Happy to walk through any of these live. — Elliot",
  },

  screeningAnswers: {
    salaryExpectation: "<<target comp range>>",
    salaryFloor: "<<hard salary floor>>",
    noticePeriod: "<<notice period>>",
    visaSponsorshipNeeded: false,
    whyNow:
      "I've built and grown e-commerce and marketing ventures largely solo and want to bring that " +
      "ownership and speed to a team that ships fast.",
    relocation: "Based in Sollentuna (Stockholm); hybrid in the Stockholm area or remote.",
    remoteSetup: "Stockholm-based, own equipment.",
    tellMeAboutYourself:
      "I'm 20, from Stockholm, and I've been building e-commerce brands and marketing agencies since I " +
      "was 14 — CRO, paid social, copywriting, and web development end to end. Lately I've gone deeper on " +
      "AI tooling (I generate AI media for Burberry with my own tools) and technical projects like a typed " +
      "affiliate-tracking integration. I move fast and own the whole funnel.",
    neverDisclose: ["exact home address", "health information"],
  },

  preferences: {
    mustHaves: ["Remote or hybrid-Stockholm", "fast-paced", "real ownership", "outcome-driven"],
    niceToHaves: ["e-commerce / DTC / AI domain", "small team / founding", "equity", "creative freedom"],
    dealbreakers: ["unpaid", "commission-only", "data broker", "payday loan", "gambling"],
    hoursConstraints: "",
    neverClaim: [
      "a university or college degree (education is upper-secondary/gymnasium in Economics & Business Development)",
      "professional employment at any company that never employed him",
      "years of experience he does not have",
      "any professional certification or licence he does not hold",
      "a driver's licence",
    ],
  },

  sources: [
    {
      name: "LinkedIn — growth/CRO/e-commerce (Sweden/EU, remote)",
      kind: "linkedin",
      url: "",
      query: "https://www.linkedin.com/jobs/search/?keywords=growth%20OR%20CRO%20OR%20ecommerce&location=Sweden&f_WT=2",
    },
    {
      name: "Wellfound (AngelList) — growth / founding, remote",
      kind: "board",
      url: "https://wellfound.com/role/growth",
      query: "remote growth ecommerce marketing",
    },
    // Watched company ATS boards (public JSON — fetched with `--fetch`). Replace the placeholders.
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
      name: "Arbetsförmedlingen (Platsbanken) — marknadsföring / e-handel",
      kind: "board",
      url: "https://arbetsformedlingen.se/platsbanken/annonser?q=e-handel%20marknadsf%C3%B6ring",
      query: "e-handel marknadsföring CRO remote",
    },
  ],
};
