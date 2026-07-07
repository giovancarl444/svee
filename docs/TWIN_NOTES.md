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
| Live LLM drafting (`AnthropicLlm`) | ⚙️ wired — needs `npm install @anthropic-ai/sdk` + `ANTHROPIC_API_KEY` |
| Live board/ATS fetching (`boardSource` fetcher) | ⚙️ seam only — inject a fetcher; no network in this build |
| Gmail inbox ingestion | ⚙️ feed `--inbox <file.json>`; wire the Gmail read to produce `InboundMessage[]` |
| The approval *tap* + final executor | ⚙️ Cortex integration point — flip `twin_approvals.status`, then run `guardExecution` |

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

# Read the digest. Fill the flagged KB slots (email, salary floor, notice…) in
# src/twin/kb.data.ts (or point TWIN_KB_PATH at a JSON KB). Re-run for a week in
# stage-only mode, tune weights, THEN consider TWIN_LIVE=1.
```

`twin:run` emits the JSON contract on stdout and a human summary on stderr, and
(with a DB) persists everything and dedupes against live applications.

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

## 8. Guardrails summary

The twin does everything up to the last click. Credentials, account creation,
final submit, accepting terms, and sending messages always route to Svee. Truth
is enforced by the KB (and the number validator). Volume is capped by the fit
threshold, on purpose.
