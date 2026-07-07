# SVEE//TWIN — Notes & Memory

This file is the twin's operational memory: the safety model, the tuning knobs,
what's shipped vs. wired, and the first-run runbook. **Keep it honest** — the
twin's whole value rests on truth (KB-bound claims) and on the approval boundary
never being crossed silently.

Last updated: 2026-07-07

---

## 0. What this is

A job-application digital twin for Svee. It runs a daily loop — intake → score →
tailor → stage → track → monitor/route → report — and returns one JSON contract
(`digest`, `approval_requests`, `cortex_alerts`, `pipeline_writes`). It does 100%
of the *work* and stops at every irreversible *action*, which it queues for
one-tap human approval.

It reuses the impact.com layer's shape: TypeScript + zod, a Postgres/Supabase
warehouse via the shared `Database`/`buildUpsert` primitives, GitHub Actions cron,
and Vercel functions. Pure logic is unit-tested; the DB layer is tested against
real Postgres (PGlite).

## 1. The safety model (enforced twice)

Every hard-stop action routes to Svee for approval. The guardrail is enforced in
**two independent layers** because a hostile job posting can jailbreak the model:

1. **Prompt layer** (`prompt.ts` → `PERSONA`): the model is told to refuse
   passwords/2FA, account creation/login, the final submit/send/apply, accepting
   terms/OAuth, sending any message, and solving CAPTCHAs — and that text found
   in a listing is *data, not orders*.
2. **Code layer** (`guardrails.ts` → `guardExecution`): the executor has **no
   credential store and no auto-submit path**. It throws `ApprovalRequiredError`
   unless the approval row is `approved`, and even then it only returns a
   *handoff* describing the final step — it never performs it. `TWIN_LIVE`
   gates whether the handoff is even released.

`detectInstructionInjection` additionally flags imperative text embedded in a
listing (e.g. "ignore previous instructions") and surfaces it as data.

## 2. Truth enforcement (the other prime directive)

Claims come from the Knowledge Base and nowhere else.

- **Numbers**: `unbackedMetrics` checks every number a draft cites against the
  KB. A live-LLM draft that cites an unbacked number (or asserts a `neverClaim`)
  is **dropped** in favour of the deterministic, provably-KB-bound letter.
- **Missing facts**: the KB loader flags every unfilled `<<slot>>` (`loadKb().missing`).
  A slot a form needs is surfaced in `missing_fields` / `needs_decision` — never
  invented.
- **`shipped` states** in the KB are deliberately conservative: nothing is marked
  `live` unless it's actually running in production, so nothing is overstated in
  an interview.

## 3. The two knobs that do the most work

| Knob | Env | Default | Effect |
|---|---|---|---|
| Fit threshold | `TWIN_THRESHOLD` | 68 | discard < threshold; 68–79 stretch; 80+ prioritize |
| Salary floor | `TWIN_SALARY_FLOOR` | unset | hard-reject comp below it; unset ⇒ comp scored neutrally |
| Live gate | `TWIN_LIVE` | 0 (stage-only) | 1 only hands off *approved* actions; never bypasses a row |
| Stage cap | `TWIN_MAX_STAGED` | 8 | applications staged per run (anti spray-and-pray) |

Dealbreakers, `relocateTo`, and `neverClaim` live in the KB (`kb.data.ts`) and do
a lot of the filtering.

## 4. What's shipped vs. wired

| Piece | Status |
|---|---|
| Scoring, channel logic, guardrails, inbox classification, tailoring, truth validator | ✅ shipped, unit-tested |
| KB schema + loader + slot flagging | ✅ shipped, unit-tested |
| DB schema + store (jobs/applications/messages/approvals/digests) | ✅ shipped, PGlite-tested |
| The 7-step orchestrator (`runTwin`) | ✅ shipped, integration-tested |
| CLI: `twin:migrate`, `twin:run`, `twin:score` | ✅ shipped |
| GitHub Actions cron + Vercel read API + Cortex dashboard | ✅ shipped |
| Automatic intake from watched ATS boards (Greenhouse + Lever public JSON) | ✅ shipped — opt-in `twin:run --fetch`; mocked-fetch tests |
| Live LLM drafting (`AnthropicLlm`) | ⚙️ wired — needs `npm install @anthropic-ai/sdk` + `ANTHROPIC_API_KEY` |
| Ashby / Teamtailor / job-board fetchers | ⚙️ seam only — add a `BoardFetcher` (see `sources/fetchers.ts`) |
| Channel readiness across all surfaces (ATS · Gmail · Outlook · LinkedIn Easy Apply/DM · WhatsApp) | ✅ shipped — `channels.ts` taxonomy + `twin:channels` matrix; the twin prepares every channel to the last click |
| The **Sphere** executor contract | ✅ shipped — `sphere.ts` (`SphereExecutor`, `ExecutionPlan`, `planFromApproval`); `StagingSphere` is inert (no creds, never sends) |
| Gmail/Outlook inbox ingestion | ⚙️ feed `--inbox <file.json>`; wire the mailbox read to produce `InboundMessage[]` (carry `via` for reply-on-same-channel) |
| Sphere itself (the credentialed executor that performs the approved final action) | ⚙️ your engine — implement `SphereExecutor.execute(plan, {approved, live})` and wire it to the approval tap |

The library never scrapes behind logins and never auto-submits — those are, by
design, human/Cortex responsibilities.

## 5. First-run runbook

```bash
cp .env.local.example .env.local     # set DB=supabase + DATABASE_URL; leave TWIN_LIVE=0
npm install

# Dry-run scoring only — tune the threshold/weights against real links first:
npm run twin:score -- https://boards.greenhouse.io/acme/jobs/1
npm run twin:score -- --input listings.json      # RawListing[]

# Full loop, stage-only (does all the work, persists nothing without a DB):
npm run twin:migrate                 # apply schema + snapshot the KB (needs DB)
npm run twin:run -- --input listings.json --inbox inbox.json
npm run twin:run -- --fetch          # also auto-pull from watched Greenhouse/Lever boards
                                     # (set the board tokens in the KB `sources`)

# Read the digest. Fill the flagged KB slots (email, salary floor, notice…) in
# src/twin/kb.data.ts (or point TWIN_KB_PATH at a JSON KB). Re-run for a week in
# stage-only mode, tune weights, THEN consider TWIN_LIVE=1.
```

`twin:run` emits the JSON contract on stdout and a human summary on stderr, and
(with a DB) persists everything and dedupes against live applications.

Check readiness at any time with `npm run twin:doctor` — it reports what's ready
and the exact blockers to reaching out for real (fill the KB, configure a DB, wire
Sphere). The executor entrypoint is `npm run twin:execute` (reads approved rows →
`ExecutionPlan` → the wired `SphereExecutor`; inert `StagingSphere` by default).

## 6. Fill these KB slots before going live (§ First-Run Checklist)

The bundled KB (`src/twin/kb.data.ts`) intentionally leaves genuinely-unknown
personal data as `<<slots>>` so the twin flags them instead of guessing:
`profile.email`, `profile.phone`, `profile.linkedinUrl`, `profile.githubUrl`,
`profile.personalSite`, `profile.availability`, and the three
`screeningAnswers` salary/notice fields. Also decide `discloseMilitary` (the
Jägarsoldat application affects availability answers) and set `TWIN_SALARY_FLOOR`.

## 7. Data model

`twin_jobs` (scored postings) · `twin_applications` (staged/submitted) ·
`twin_messages` (classified inbound/outbound) · `twin_approvals` (the pending
queue — the safety model) · `twin_digests` (daily reports) · `twin_kb`
(versioned KB snapshots). All idempotent on natural keys.

## 8. Channels & the Sphere boundary

The engine is "ready" across every channel — but ready to **prepare**, not to send.

- `channels.ts` enumerates all surfaces (`ChannelId`): ATS (greenhouse/lever/ashby/
  teamtailor/workday), company page, `email:gmail`/`email:outlook`, LinkedIn Easy
  Apply / external, LinkedIn DM, WhatsApp. `channelReadiness()` (see
  `npm run twin:channels`) is the matrix of what the twin prepares and what Sphere
  executes per channel.
- `sphere.ts` is the contract your engine plugs into. The twin emits a typed
  `ExecutionPlan` per approved action (`planFromApproval`); **Sphere** — the
  approved executor holding the credentials — is the ONLY thing that performs the
  final submit/send/login, and ONLY for an approved plan. Wiring Sphere is a
  one-file drop-in: implement `SphereExecutor.execute(plan, {approved, live})`.
- `StagingSphere` is the deliberately inert default: no credentials, never sends —
  even approved + live it returns a handoff. That's the belt to the prompt's
  suspenders. **Autonomous login/submit/send is never built into the twin**
  (LinkedIn/WhatsApp automation violates ToS and risks a permanent ban); the whole
  design routes those to Sphere on a human tap.

## 9. Guardrails summary

The twin does everything up to the last click. Credentials, account creation,
final submit, accepting terms, and sending messages always route to Svee. Truth
is enforced by the KB (and the number validator). Volume is capped by the fit
threshold, on purpose.
