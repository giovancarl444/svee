import type Anthropic from '@anthropic-ai/sdk';
import { writeApiCall } from './audit';
import { estimateCostUsd, type TokenUsage } from './pricing';
import { getProvider } from './provider';

/**
 * A single structured-output call to the configured model provider. We force a
 * tool/function call as the reliable way to get strict JSON back rather than
 * parsing free-text. The `payload` is the allowlisted object from the redaction
 * layer; it is sent to the provider AND audited verbatim — the provider swap
 * (Anthropic ↔ OpenAI-compatible) does not change what is sent or recorded.
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
  const { data, usage } = await getProvider().structured<T>({
    model: input.model,
    system: input.system,
    payload: input.payload,
    tool: input.tool,
    maxTokens: input.maxTokens ?? 1024,
  });

  const costEstimate = estimateCostUsd(input.model, usage);

  await writeApiCall({
    purpose: input.purpose,
    model: input.model,
    ...(input.relatedItemId ? { relatedItemId: input.relatedItemId } : {}),
    inputSummary: input.payload,
    tokenUsage: usage,
    costEstimate,
  });

  return { data, usage, costEstimate };
}

/**
 * A free-text call (no forced tool) for prose outputs like the nightly brief.
 * The `payload` is the allowlisted synthesis input; it is sent AND audited.
 */
export interface TextCall {
  purpose: string;
  model: string;
  system: string;
  payload: unknown;
  relatedItemId?: string;
  maxTokens?: number;
}

export async function textCall(
  input: TextCall,
): Promise<{ text: string; usage: TokenUsage; costEstimate: number }> {
  const { text, usage } = await getProvider().text({
    model: input.model,
    system: input.system,
    payload: input.payload,
    maxTokens: input.maxTokens ?? 2000,
  });

  const costEstimate = estimateCostUsd(input.model, usage);

  await writeApiCall({
    purpose: input.purpose,
    model: input.model,
    ...(input.relatedItemId ? { relatedItemId: input.relatedItemId } : {}),
    inputSummary: input.payload,
    tokenUsage: usage,
    costEstimate,
  });

  return { text, usage, costEstimate };
}
