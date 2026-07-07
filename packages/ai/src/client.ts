import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '@cortex/config';
import { writeApiCall } from './audit';
import { estimateCostUsd, type TokenUsage } from './pricing';

let anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    const key = getEnv().ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set — cannot call the model.');
    anthropic = new Anthropic({ apiKey: key });
  }
  return anthropic;
}

/**
 * A single structured-output call to Claude. We force a tool call
 * (`tool_choice: { type: 'tool' }`) as the reliable way to get strict JSON back,
 * rather than parsing free-text. The `payload` is the allowlisted object from the
 * redaction layer; it is sent AND audited verbatim.
 */
export interface StructuredCall {
  purpose: string;
  model: string;
  system: string;
  payload: unknown;
  tool: { name: string; description: string; schema: Anthropic.Tool.InputSchema };
  relatedItemId?: string;
  maxTokens?: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: TokenUsage;
  costEstimate: number;
}

export async function structuredCall<T>(input: StructuredCall): Promise<StructuredResult<T>> {
  const client = getAnthropic();

  const res = await client.messages.create({
    model: input.model,
    max_tokens: input.maxTokens ?? 1024,
    system: input.system,
    tools: [
      { name: input.tool.name, description: input.tool.description, input_schema: input.tool.schema },
    ],
    tool_choice: { type: 'tool', name: input.tool.name },
    messages: [{ role: 'user', content: JSON.stringify(input.payload) }],
  });

  const block = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (!block) {
    throw new Error(`Model did not return a "${input.tool.name}" tool_use block.`);
  }

  const usage: TokenUsage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
  const costEstimate = estimateCostUsd(input.model, usage);

  await writeApiCall({
    purpose: input.purpose,
    model: input.model,
    relatedItemId: input.relatedItemId,
    inputSummary: input.payload,
    tokenUsage: usage,
    costEstimate,
  });

  return { data: block.input as T, usage, costEstimate };
}
