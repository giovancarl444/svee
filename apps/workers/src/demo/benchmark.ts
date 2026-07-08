import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLASSIFICATION_SCHEMA,
  TRIAGE_SYSTEM,
  buildTriagePayload,
  estimateCostUsd,
  getProvider,
  normalizeTriageResult,
  type TriageResult,
} from '@cortex/ai';
import { loadLocalEnv } from '@cortex/config';
import { CATEGORIES, type Category } from '@cortex/core';
import { buildDemoInbox, type DemoSeedItem } from './demo-inbox';

/**
 * Scored local-model triage benchmark. On the SAME ground-truth-labeled synthetic
 * inbox, run each candidate local model through the REAL redaction payload +
 * triage schema + system prompt, and score category accuracy, urgency accuracy,
 * latency, tokens, and cost. Turns CORTEX's cost-routing thesis into data — and
 * quantifies why a reasoning model (qwen3) is unfit for bounded structured calls.
 *
 * Run: pnpm --filter @cortex/workers benchmark
 */

loadLocalEnv(); // populate process.env from .env so getProvider() sees the Ollama profile
const provider = getProvider();
const BASE_URL = process.env.CORTEX_OPENAI_BASE_URL || 'http://localhost:11434/v1';
const CATEGORY_SET = new Set<string>(CATEGORIES);

interface ModelSpec {
  id: string;
  /** Cap the item count (for models expected to fail slowly, e.g. reasoning models). */
  limit?: number;
  note?: string;
}

const MODELS: ModelSpec[] = [
  { id: 'qwen2.5:7b-instruct', note: 'pipeline default (non-reasoning instruct)' },
  { id: 'gemma3:4b', note: 'smaller/faster alternative' },
  { id: 'qwen3:4b', limit: 6, note: 'reasoning model — expected to fail bounded structured calls' },
];

interface CallOutcome {
  rawCategory: string | null;
  result: TriageResult | null;
  promptTokens: number;
  completionTokens: number;
  ms: number;
  err?: string;
}

/** One structured triage call through the REAL provider seam (tool-call → json_object
 *  fallback + reasoning-model hardening), so every model is judged exactly as the
 *  pipeline would call it. */
async function callTriage(model: string, payload: unknown): Promise<CallOutcome> {
  const started = Date.now();
  try {
    const { data, usage } = await provider.structured<Partial<TriageResult>>({
      model,
      system: TRIAGE_SYSTEM,
      payload,
      tool: { name: 'record_triage', description: 'Record the triage classification.', schema: CLASSIFICATION_SCHEMA },
      maxTokens: 400,
    });
    const ms = Date.now() - started;
    const rawCategory = typeof data.category === 'string' ? data.category : null;
    return { rawCategory, result: normalizeTriageResult(data), promptTokens: usage.input ?? 0, completionTokens: usage.output ?? 0, ms };
  } catch (err) {
    return { rawCategory: null, result: null, promptTokens: 0, completionTokens: 0, ms: Date.now() - started, err: (err as Error).message };
  }
}

interface ModelScore {
  model: string;
  note?: string;
  attempted: number;
  validOutputs: number; // parsed AND category in-vocabulary
  categoryCorrect: number;
  urgencyWithin1: number;
  failures: number;
  avgLatencyMs: number;
  totalTokens: number;
  costUsd: number;
  perItem: Array<{ id: string; expected: Category; predicted: string | null; correct: boolean; ms: number; err?: string }>;
}

async function scoreModel(spec: ModelSpec, inbox: DemoSeedItem[]): Promise<ModelScore> {
  const items = spec.limit ? inbox.slice(0, spec.limit) : inbox;
  const score: ModelScore = {
    model: spec.id,
    ...(spec.note ? { note: spec.note } : {}),
    attempted: items.length,
    validOutputs: 0,
    categoryCorrect: 0,
    urgencyWithin1: 0,
    failures: 0,
    avgLatencyMs: 0,
    totalTokens: 0,
    costUsd: 0,
    perItem: [],
  };

  let totalMs = 0;
  for (const item of items) {
    const payload = buildTriagePayload({
      source: item.source,
      senderDisplay: item.sender.displayName,
      senderImportance: 1,
      timestamp: item.timestamp,
      subject: item.subject ?? null,
      bodySnippet: item.bodySnippet ?? null,
    });
    const out = await callTriage(spec.id, payload);
    totalMs += out.ms;
    score.totalTokens += out.promptTokens + out.completionTokens;
    score.costUsd += estimateCostUsd(spec.id, { input: out.promptTokens, output: out.completionTokens });

    const valid = !out.err && out.rawCategory != null && CATEGORY_SET.has(out.rawCategory);
    const correct = valid && out.rawCategory === item.label.category;
    if (valid) {
      score.validOutputs++;
      if (correct) score.categoryCorrect++;
      if (out.result && Math.abs(out.result.urgency - item.label.urgency) <= 1) score.urgencyWithin1++;
    } else {
      score.failures++;
    }
    score.perItem.push({
      id: item.sourceItemId,
      expected: item.label.category,
      predicted: out.rawCategory,
      correct,
      ms: out.ms,
      ...(out.err ? { err: out.err } : {}),
    });
    process.stdout.write(correct ? '.' : valid ? 'x' : '!');
  }
  score.avgLatencyMs = Math.round(totalMs / Math.max(1, items.length));
  process.stdout.write('\n');
  return score;
}

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${Math.round((100 * n) / d)}%`;
}

async function main(): Promise<void> {
  const inbox = buildDemoInbox();
  console.log(`\nCORTEX local-model triage benchmark — ${inbox.length} ground-truth-labeled items @ ${BASE_URL}\n`);

  const scores: ModelScore[] = [];
  for (const spec of MODELS) {
    console.log(`> ${spec.id}${spec.limit ? ` (first ${spec.limit})` : ''} — ${spec.note ?? ''}`);
    scores.push(await scoreModel(spec, inbox));
  }

  const header = '| model | items | category acc | urgency ±1 | valid JSON | failures | avg latency | tokens | cost |';
  const sep = '|---|---|---|---|---|---|---|---|---|';
  const rows = scores.map((s) => {
    return `| \`${s.model}\` | ${s.attempted} | ${pct(s.categoryCorrect, s.attempted)} | ${pct(s.urgencyWithin1, s.validOutputs)} | ${pct(s.validOutputs, s.attempted)} | ${s.failures} | ${s.avgLatencyMs} ms | ${s.totalTokens} | $${s.costUsd.toFixed(6)} |`;
  });
  const table = [header, sep, ...rows].join('\n');
  console.log(`\n${table}\n`);

  const DEMO_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../demo');
  writeFileSync(join(DEMO_DIR, 'benchmark.json'), `${JSON.stringify({ baseUrl: BASE_URL, itemCount: inbox.length, scores }, null, 2)}\n`);
  writeFileSync(
    join(DEMO_DIR, 'benchmark.md'),
    `# CORTEX local-model triage benchmark\n\n${inbox.length} ground-truth-labeled synthetic items, scored against the operator's expected category/urgency. Same redaction payload + triage schema + system prompt for every model. Cost pulled from CORTEX's own pricing table (local = \\$0).\n\n${table}\n\n- **category acc** = predicted category == the label, over all attempted items (a failed/invalid output counts as wrong).\n- **urgency ±1** = predicted urgency within 1 of the label, over valid outputs.\n- **valid JSON** = share of calls that returned an in-vocabulary category (a reasoning model that "thinks" past the token budget returns none).\n`,
  );
  console.log(`wrote demo/benchmark.json + demo/benchmark.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
