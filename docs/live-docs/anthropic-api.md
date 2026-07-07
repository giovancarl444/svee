# Anthropic Claude API

_Surface:_ Anthropic Claude **Messages API** (`POST /v1/messages`) consumed from a TypeScript backend via the official `@anthropic-ai/sdk`. Everything (tool use, forced JSON, caching, token counting) is a feature of this one endpoint. For the CORTEX stack the three models resolve as: `claude-haiku-4-5` (= `claude-haiku-4-5-20251001`) for cheap triage, `claude-sonnet-5` for escalation, `claude-opus-4-8` for nightly synthesis — all valid, current 2026 IDs.

## Current version
API version header: `anthropic-version: 2023-06-01` (unchanged). SDK: `@anthropic-ai/sdk` (TypeScript; install latest — `npm i @anthropic-ai/sdk`). Model IDs & limits (verified against docs 2026-07): `claude-opus-4-8` — 1M context / 128K max output, $5/$25 per MTok; `claude-sonnet-5` — 1M / 128K, $2/$10 per MTok introductory through 2026-08-31 then $3/$15; `claude-haiku-4-5` (full snapshot `claude-haiku-4-5-20251001`) — 200K / 64K, $1/$5 per MTok. NOTE: Opus 4.8 & Sonnet 5 use a newer tokenizer (~30% more tokens per text than pre-4.7 models); Haiku 4.5 uses the older tokenizer — count tokens per-model.

## Auth
API-key model. Send `x-api-key: <key>` + `anthropic-version: 2023-06-01`. The SDK reads it from env: `new Anthropic()` picks up `ANTHROPIC_API_KEY` automatically (don't hardcode). Precedence chain: `ANTHROPIC_API_KEY` → `ANTHROPIC_AUTH_TOKEN` (OAuth bearer, sent as `Authorization: Bearer` + `anthropic-beta: oauth-2025-04-20`) → `ant auth login` profile → Workload Identity Federation env vars. Minimum requirement: a standard workspace API key with access to the three models — no special OAuth scopes are needed for the Messages API. For a server backend, inject `ANTHROPIC_API_KEY` from your secrets manager. Never set both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` (the API 401s if both headers are present).

## Key APIs
- **client.messages.create({...})** — Core call. Returns a Message with content[] (discriminated union — narrow by block.type), usage, stop_reason, model, id. Params: model, max_tokens (required), system, messages, tools, tool_choice, output_config, cache_control. _(Non-streaming default max_tokens ~16000; classification ~256-512. For >16K output you MUST stream.)_
- **tool_choice: {type:'tool', name:'...'} + tools[{strict:true}]** — THE reliable forced-JSON path. Forcing a tool makes the model emit exactly one tool_use block; strict:true guarantees tool_use.input validates against the JSON schema via constrained decoding. Read the JSON off the tool_use block. _(tool_choice alone forces the call but does NOT validate the schema — you also need strict:true on the tool. GA on Haiku 4.5, Sonnet 5, Opus 4.8.)_
- **output_config: {format:{type:'json_schema', schema}}  /  client.messages.parse()** — Modern canonical structured-output method: constrains the final assistant message to a JSON schema. .parse() (with zodOutputFormat) returns typed response.parsed_output. Prefer this for pure classification/extraction where you don't otherwise need a tool interface. _(Replaces the deprecated top-level output_format param. Incompatible with citations. Both this and strict tools use grammar compilation (one-time latency, 24h cache).)_
- **client.messages.stream({...}) → .finalMessage()** — Streaming for long synthesis outputs (avoids SDK HTTP timeouts at high max_tokens). Iterate events or just await finalMessage() for the assembled Message + usage. _(Default max_tokens ~64000 when streaming.)_
- **client.messages.countTokens({model, system, messages, tools})** — Pre-flight token count for budgeting/cost estimate. Returns .input_tokens. Model-specific — pass the same model you'll call. _(Never use tiktoken (OpenAI tokenizer) — undercounts Claude by 15-30%+.)_
- **response.usage** — Cost/audit source of truth on every response: input_tokens (uncached only), output_tokens, cache_creation_input_tokens, cache_read_input_tokens. Total prompt = sum of the three input fields. _(Server-tool usage (web_search_requests etc.) appears under usage.server_tool_use if used.)_
- **client.messages.batches.create/retrieve/results** — Async bulk at 50% off both input & output tokens; ideal for the nightly synthesis fan-out. Key results by custom_id (unordered). _(Poll processing_status until 'ended'.)_

## Incremental sync
Not applicable in the mailbox/historyId sense — the Messages API is fully **stateless**: you resend the entire conversation (messages[]) on every turn; there is no server-side sync cursor or delta feed. For the CORTEX **cost/audit log**, the "incremental" unit is the per-request `response.usage` snapshot: persist one audit row per call keyed by `response.id` (and the `request-id` header, obtainable via `await client.messages.create(...).withResponse()` or the attached `_request_id`), accumulate input/output/cache tokens, and compute cost from a per-model rate table. Two supporting mechanisms: (1) prompt caching lets repeated prefixes bill at 0.1× and shows up as `cache_read_input_tokens` you can reconcile against; (2) for org-level reconciliation beyond your own log, Anthropic exposes an Admin **Usage & Cost** reporting API (separate admin key) — treat your per-request usage capture as primary and the admin report as a monthly cross-check.

## Gotchas
- BIGGEST ONE for classification: `temperature` (and top_p/top_k) is REJECTED with HTTP 400 on Sonnet 5 (non-default) and Opus 4.8. Only Haiku 4.5 still accepts temperature=0. For deterministic-ish classification on Sonnet 5/Opus 4.8, OMIT temperature and instead use `output_config:{effort:'low'}` + a strict JSON schema (constrained decoding is what actually removes output ambiguity).
- Prompting-for-JSON (asking for JSON in the system prompt, no schema enforcement) is the LEAST reliable method and should be avoided — use forced strict tool OR output_config.format. Both guarantee valid JSON via constrained decoding.
- `effort` is supported on Sonnet 5 & Opus 4.8 (defaults to 'high') but ERRORS on Haiku 4.5. Don't send effort to the triage tier.
- Thinking defaults differ: Sonnet 5 runs ADAPTIVE thinking when you omit `thinking` (spends thinking tokens silently) — set `thinking:{type:'disabled'}` for fast/cheap triage. Opus 4.8 runs WITHOUT thinking when omitted — set `thinking:{type:'adaptive'}` explicitly for nightly synthesis. `budget_tokens` (extended thinking) is 400 on both Sonnet 5 & Opus 4.8; it's only valid on Haiku 4.5.
- thinking.display defaults to 'omitted' on Sonnet 5/Opus 4.8 (empty thinking text). If you want to log reasoning summaries, set `thinking:{type:'adaptive', display:'summarized'}`.
- Assistant-message prefills (last turn role:'assistant' to force a JSON prefix) return 400 on Sonnet 5 & Opus 4.8 — use output_config.format or a strict tool instead.
- content is a discriminated union: `res.content[0].text` won't typecheck — find the block with `.type==='tool_use'` / `'text'` first. Always check `res.stop_reason` for 'refusal' before trusting output.
- max_tokens is a hard cap; hitting it truncates mid-output with stop_reason:'max_tokens'. Stream for anything >~16K (Haiku 4.5 caps at 64K output; Opus/Sonnet at 128K).
- Prompt-cache minimum prefix is 4096 tokens for Opus 4.8 & Haiku 4.5 (Sonnet 5 not explicitly published — verify; treat 4096 as safe). Shorter prefixes silently don't cache. Any byte change in the prefix (timestamp, unsorted JSON, varying tool set) invalidates the cache — verify with usage.cache_read_input_tokens.
- Sonnet 5 introductory pricing ($2/$10) EXPIRES 2026-08-31 → $3/$15. Bake an effective-date into your cost-rate table or you'll under-report after Sept 1.
- Tool definitions add a per-model 'tool use system prompt' token overhead (e.g. Opus 4.8: 290 tok for auto/none, 410 for forced tool; Sonnet 5: 354/474; Haiku 4.5: 496/588) — include this when estimating cost.
- strict-tool limits: max 20 strict tools/request, max 24 optional params, max 16 union-typed params; schemas must have additionalProperties:false + required; no min/max, minLength/maxLength, or recursive schemas.

## Canonical pattern
```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic(); // reads ANTHROPIC_API_KEY

// Reliable structured output = one FORCED tool with a STRICT JSON schema.
const triageTool: Anthropic.Tool = {
  name: "record_triage",
  description: "Emit the triage classification for the ticket.",
  strict: true, // guarantees tool_use.input matches the schema (constrained decoding)
  input_schema: {
    type: "object",
    properties: {
      category: { type: "string", enum: ["billing", "bug", "abuse", "other"] },
      severity: { type: "integer", enum: [1, 2, 3, 4, 5] },
      escalate: { type: "boolean" },
    },
    required: ["category", "severity", "escalate"],
    additionalProperties: false,
  },
};

const res = await client.messages.create({
  model: "claude-haiku-4-5",     // cheap triage tier
  max_tokens: 512,
  temperature: 0,                // OK on Haiku 4.5; on Sonnet 5 / Opus 4.8 DROP this
                                 // and use output_config:{effort:"low"} instead (temp -> 400)
  system: [{ type: "text", text: TRIAGE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: ticketText }],
  tools: [triageTool],
  tool_choice: { type: "tool", name: "record_triage" }, // force it
});

if (res.stop_reason === "refusal") throw new Error("model refused");
const block = res.content.find((b) => b.type === "tool_use");
const triage = block?.type === "tool_use" ? block.input : null; // schema-valid JSON

// Cost / audit log — everything is on res.usage
const u = res.usage;
await auditLog.write({
  requestId: (res as any)._request_id,           // or use .withResponse() for the header
  model: res.model,
  stopReason: res.stop_reason,
  inputTokens: u.input_tokens,                    // uncached input only
  outputTokens: u.output_tokens,
  cacheWriteTokens: u.cache_creation_input_tokens ?? 0,  // billed 1.25x (5m) / 2x (1h)
  cacheReadTokens: u.cache_read_input_tokens ?? 0,       // billed 0.10x
});
```

## Recommendation for CORTEX
Build a thin typed wrapper around `client.messages.create` with three per-tier presets that encode the model-specific param rules, because the SAME params behave differently per model:
• **Triage (`claude-haiku-4-5`)**: `temperature: 0`, no `effort`, `thinking` omitted; forced strict tool (or `output_config.format`) for the label. Cheapest path; deterministic-friendly.
• **Escalation (`claude-sonnet-5`)**: NO `temperature` (400), set `output_config:{effort:'low'|'medium'}` and `thinking:{type:'disabled'}` for fast classification (adaptive is on-by-default if you omit it); forced strict tool for structured verdicts.
• **Nightly synthesis (`claude-opus-4-8`)**: NO `temperature`; `thinking:{type:'adaptive'}` + `output_config:{effort:'high'|'xhigh'}`; STREAM with `.stream().finalMessage()` because output can be large; enable prompt caching (`cache_control` on the stable corpus/instructions prefix, consider `ttl:'1h'`) since the nightly run reuses a big shared prefix; consider the Batch API (50% off) if the synthesis is fan-out over many items keyed by custom_id.

For ALL structured outputs prefer constrained decoding — forced strict tool (`tool_choice:{type:'tool'}` + `strict:true`) or `output_config.format` json_schema (with `client.messages.parse()` for typed `parsed_output`). Never rely on prompt-for-JSON. For the cost/audit log, persist `response.usage` + `response.id`/request-id per call and price from a per-model rate table with an effective-date (Sonnet 5 flips $2/$10 → $3/$15 on 2026-09-01); include cache multipliers (write 1.25×/2×, read 0.1×) and the per-model tool-use system-prompt token overhead. Use `client.messages.countTokens` per-model for pre-flight budgeting (never tiktoken). Always guard `stop_reason === 'refusal'` before consuming content.

## Citations
- [Models overview (IDs, context windows, pricing, thinking support)](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Pricing (per-model rates, prompt-cache multipliers, batch discount, Sonnet 5 intro pricing)](https://platform.claude.com/docs/en/about-claude/pricing)
- [Structured outputs (output_config.format json_schema, strict tool use, schema limits)](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Tool use overview (tool_choice, strict tools, tool_use blocks)](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- [Messages API reference](https://platform.claude.com/docs/en/api/messages)
- [Prompt caching (cache_control, TTL, usage fields, minimum prefix)](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Token counting (count_tokens endpoint)](https://platform.claude.com/docs/en/build-with-claude/token-counting)
- [Effort parameter (low/medium/high/xhigh/max)](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Adaptive thinking](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking)
- [Anthropic TypeScript SDK (@anthropic-ai/sdk)](https://github.com/anthropics/anthropic-sdk-typescript)
