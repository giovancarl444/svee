import { describe, it, expect } from "vitest";
import { runTwin } from "./loop.js";
import { loadTwinConfig } from "./config.js";
import { TwinRunOutputSchema } from "./contracts.js";
import { fixtureKb, makeFacts } from "./test-support.js";
import type { RawListing } from "./sources/types.js";
import type { InboundMessage } from "./inbox.js";

function run() {
  const kb = fixtureKb();
  const config = loadTwinConfig({ env: {}, argv: [] });
  let n = 0;
  const idGen = () => `id-${n++}`;

  const listings: RawListing[] = [
    { facts: makeFacts({ url: "https://boards.greenhouse.io/acme/jobs/strong" }) }, // strong → stage
    {
      facts: makeFacts({
        company: "QAWorld",
        role: "Manual QA Tester",
        requiredSkills: [],
        url: "https://boards.greenhouse.io/qa/jobs/qa",
      }),
    }, // 'not' family → discard
    {
      facts: makeFacts({
        company: "BerlinCo",
        role: "Backend Engineer",
        onsite: true,
        location: "Berlin",
        workMode: "onsite",
        url: "https://boards.greenhouse.io/berlin/jobs/onsite",
      }),
    }, // hard filter → discard
    {
      facts: makeFacts({ company: "LivCo", role: "Live Role", url: "https://x/live" }),
    }, // already-live → deduped out of scoring
  ];

  const inbound: InboundMessage[] = [
    { id: "i1", body: "Are you available for an interview next week?", company: "Acme", role: "Full-stack Engineer" },
    { id: "o1", body: "We would like to offer you the role.", company: "Nordic", role: "Engineer" },
  ];

  return runTwin({
    kb,
    missingSlots: [],
    config,
    listings,
    inbound,
    state: {
      liveApplicationKeys: new Set(["livco::live role"]),
      submittedPrevRun: 3,
      followupsDue: [
        { applicationId: "app-x", company: "OldCo", role: "Old Role", channel: "ats:lever", daysWaiting: 9 },
      ],
    },
    now: new Date("2026-07-07T00:00:00Z"),
    idGen,
  });
}

describe("runTwin — the daily loop", () => {
  it("intakes, scores, stages, tracks, routes and reports", async () => {
    const out = await run();

    // Contract holds.
    expect(() => TwinRunOutputSchema.parse(out)).not.toThrow();

    // Digest counts.
    const d = out.digest;
    expect(d.found).toBe(4);
    expect(d.scored).toBe(3); // the live one is deduped out
    expect(d.passed_threshold).toBe(1);
    expect(d.staged).toBe(1);
    expect(d.discarded_low_fit).toBe(2); // QA + on-site
    expect(d.submitted_prev_run).toBe(3);
    expect(d.run_at).toBe("2026-07-07T00:00:00.000Z");
  });

  it("stages exactly the strong role, with a KB-bound package", async () => {
    const out = await run();
    const submit = out.approval_requests.find((a) => a.type === "submit_application");
    expect(submit).toBeDefined();
    expect(submit!.company).toBe("Acme");
    expect(submit!.cv_variant).toBe("A");
    expect(submit!.cover_letter).toContain("Acme");
    expect(submit!.missing_fields).toHaveLength(0);
    expect(submit!.screening_answers.length).toBeGreaterThan(0);
  });

  it("routes interview + offer to Cortex alerts and drafts a ghost follow-up", async () => {
    const out = await run();
    const kinds = out.cortex_alerts.map((a) => a.kind);
    expect(kinds).toContain("offer");
    expect(kinds).toContain("interview_request");
    expect(kinds).toContain("ghost_followup");
    expect(out.cortex_alerts.find((a) => a.kind === "offer")!.priority).toBe("critical");

    // The offer never auto-responds — it only drafts a holding reply.
    const offer = out.cortex_alerts.find((a) => a.kind === "offer")!;
    expect(offer.suggested_reply).not.toBe("");
    expect(offer.requires).toMatch(/decide/i);

    // The follow-up is queued as an approval (never sent autonomously).
    expect(out.approval_requests.some((a) => a.type === "send_followup")).toBe(true);
  });

  it("emits the right pipeline writes and surfaces the offer at the top", async () => {
    const out = await run();
    const tables = out.pipeline_writes.map((w) => w.table);
    expect(tables.filter((t) => t === "jobs")).toHaveLength(3);
    expect(tables.filter((t) => t === "applications")).toHaveLength(1);
    expect(tables.filter((t) => t === "messages")).toHaveLength(2);
    expect(out.digest.needs_decision[0]).toMatch(/^OFFER/);
  });
});
