import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '@cortex/config';
import type { TokenUsage } from './pricing';

/**
 * The model transport, abstracted so CORTEX can run on Anthropic OR any
 * OpenAI-compatible endpoint (Constraint §4 says the only model egress is the
 * one configured provider — this layer does NOT relax that; it just makes
 * *which* provider swappable). Two implementations:
 *
 *   - `AnthropicProvider`   — the pinned Claude tiers (Haiku/Sonnet/Opus).
 *   - `OpenAICompatProvider`— a local Ollama (Qwen3) or a cheap hosted model
 *                              (DeepSeek, OpenRouter). Running the triage model
 *                              *locally* is the strongest fit for the local-first
 *                              rule: with Ollama nothing leaves the machine at all.
 *
 * The redaction/allowlist layer and the `api_calls` audit sit ABOVE this seam
 * (in `client.ts`): the payload a provider receives is already allowlisted, and
 * it is audited verbatim regardless of which provider sent it. A provider only
 * moves bytes and reports token usage — it never constructs a payload.
 */
export interface ProviderStructuredInput {
  model: string;
  system: string;
  payload: unknown;
  tool: { name: string; description: string; schema: object };
  maxTokens: number;
}

export interface ProviderTextInput {
  model: string;
  system: string;
  payload: unknown;
  maxTokens: number;
}

export interface ModelProvider {
  readonly kind: 'anthropic' | 'openai';
  structured<T>(input: ProviderStructuredInput): Promise<{ data: T; usage: TokenUsage }>;
  text(input: ProviderTextInput): Promise<{ text: string; usage: TokenUsage }>;
}

// --- Anthropic ---------------------------------------------------------------

class AnthropicProvider implements ModelProvider {
  readonly kind = 'anthropic' as const;
  readonly #client: Anthropic;

  constructor(apiKey: string) {
    this.#client = new Anthropic({ apiKey });
  }

  async structured<T>(input: ProviderStructuredInput): Promise<{ data: T; usage: TokenUsage }> {
    const res = await this.#client.messages.create({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      tools: [
        {
          name: input.tool.name,
          description: input.tool.description,
          input_schema: input.tool.schema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: input.tool.name },
      messages: [{ role: 'user', content: JSON.stringify(input.payload) }],
    });
    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!block) {
      throw new Error(`Model did not return a "${input.tool.name}" tool_use block.`);
    }
    return {
      data: block.input as T,
      usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
    };
  }

  async text(input: ProviderTextInput): Promise<{ text: string; usage: TokenUsage }> {
    const res = await this.#client.messages.create({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: [{ role: 'user', content: JSON.stringify(input.payload) }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { text, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
  }
}

// --- OpenAI-compatible (Ollama / DeepSeek / OpenRouter) ----------------------

interface OpenAIChatMessage {
  content: string | null;
  tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
}
interface OpenAIChatResponse {
  choices?: Array<{ message?: OpenAIChatMessage }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Strict parse of a tool-call arguments string (already JSON). */
function parseJson<T>(s: string): T {
  return JSON.parse(s) as T;
}

/**
 * Tolerant parse for models that answer with JSON wrapped in prose or ```json
 * fences instead of a clean tool call. Grabs the first balanced object.
 */
function extractJson<T>(s: string): T {
  const unfenced = s.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not extract JSON from model output: ${s.slice(0, 200)}`);
  }
  return JSON.parse(unfenced.slice(start, end + 1)) as T;
}

class OpenAICompatProvider implements ModelProvider {
  readonly kind = 'openai' as const;
  readonly #baseUrl: string;
  readonly #apiKey: string | undefined;

  constructor(baseUrl: string, apiKey?: string) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#apiKey = apiKey;
  }

  async #post(body: Record<string, unknown>): Promise<OpenAIChatResponse> {
    const res = await fetch(`${this.#baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.#apiKey ? { authorization: `Bearer ${this.#apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `OpenAI-compatible endpoint ${this.#baseUrl} returned ${res.status}: ${detail.slice(0, 300)}`,
      );
    }
    return (await res.json()) as OpenAIChatResponse;
  }

  #usage(r: OpenAIChatResponse): TokenUsage {
    return { input: r.usage?.prompt_tokens ?? 0, output: r.usage?.completion_tokens ?? 0 };
  }

  async structured<T>(input: ProviderStructuredInput): Promise<{ data: T; usage: TokenUsage }> {
    const messages = [
      { role: 'system', content: input.system },
      { role: 'user', content: JSON.stringify(input.payload) },
    ];

    // Attempt 1: native function/tool calling (Qwen3, DeepSeek, most OpenRouter
    // models). We force the one function so the reply is a structured call.
    try {
      const r = await this.#post({
        model: input.model,
        max_tokens: input.maxTokens,
        messages,
        tools: [
          {
            type: 'function',
            function: {
              name: input.tool.name,
              description: input.tool.description,
              parameters: input.tool.schema,
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: input.tool.name } },
      });
      const args = r.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (args) return { data: parseJson<T>(args), usage: this.#usage(r) };
      const content = r.choices?.[0]?.message?.content;
      if (content) return { data: extractJson<T>(content), usage: this.#usage(r) };
    } catch {
      // Fall through — the endpoint may not support tools; retry in JSON mode.
    }

    // Attempt 2: JSON mode with the schema inlined into the system prompt, for
    // servers that ignore/refuse the tools param.
    const r2 = await this.#post({
      model: input.model,
      max_tokens: input.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${input.system}\n\nRespond with ONLY a JSON object matching this schema:\n${JSON.stringify(input.tool.schema)}`,
        },
        { role: 'user', content: JSON.stringify(input.payload) },
      ],
    });
    const content2 = r2.choices?.[0]?.message?.content;
    if (!content2) {
      throw new Error('OpenAI-compatible endpoint returned no content for a structured call.');
    }
    return { data: extractJson<T>(content2), usage: this.#usage(r2) };
  }

  async text(input: ProviderTextInput): Promise<{ text: string; usage: TokenUsage }> {
    const r = await this.#post({
      model: input.model,
      max_tokens: input.maxTokens,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: JSON.stringify(input.payload) },
      ],
    });
    return { text: (r.choices?.[0]?.message?.content ?? '').trim(), usage: this.#usage(r) };
  }
}

// --- Factory -----------------------------------------------------------------

let provider: ModelProvider | null = null;

/** The configured provider (memoized). `CORTEX_MODEL_PROVIDER` selects it. */
export function getProvider(): ModelProvider {
  if (provider) return provider;
  const env = getEnv();
  if (env.CORTEX_MODEL_PROVIDER === 'openai') {
    if (!env.CORTEX_OPENAI_BASE_URL) {
      throw new Error(
        'CORTEX_MODEL_PROVIDER=openai requires CORTEX_OPENAI_BASE_URL ' +
          '(e.g. http://localhost:11434/v1 for Ollama, https://api.deepseek.com/v1 for DeepSeek).',
      );
    }
    provider = new OpenAICompatProvider(env.CORTEX_OPENAI_BASE_URL, env.CORTEX_OPENAI_API_KEY);
  } else {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set — cannot call the model. ' +
          '(Set CORTEX_MODEL_PROVIDER=openai to run on a local/OpenAI-compatible model instead.)',
      );
    }
    provider = new AnthropicProvider(key);
  }
  return provider;
}

/** For tests — drop the memoized provider so env changes take effect. */
export function resetProviderCache(): void {
  provider = null;
}
