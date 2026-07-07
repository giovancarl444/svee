/**
 * LLM client for the tailoring/drafting path. Pluggable so the whole loop runs
 * end-to-end WITHOUT credentials (dry-run returns "", which the tailor reads as
 * "use the deterministic, KB-bound template"). The live path calls Claude through
 * the official Anthropic SDK.
 *
 * The SDK is imported lazily via a non-literal specifier so `tsc` and the tests
 * never require the package to be installed — exactly how the sync layer lazily
 * imports `pg`. Install `@anthropic-ai/sdk` to enable the live path.
 */
export interface LlmCompleteOptions {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface LlmClient {
  complete(opts: LlmCompleteOptions): Promise<string>;
}

/** Dry-run client. Returns "" → callers fall back to deterministic output. */
export class DryRunLlm implements LlmClient {
  async complete(): Promise<string> {
    return "";
  }
}

export interface AnthropicLlmOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

/** Live client — Claude via the official SDK (loaded on demand). */
export class AnthropicLlm implements LlmClient {
  constructor(private readonly opts: AnthropicLlmOptions) {}

  async complete({ system, user, maxTokens }: LlmCompleteOptions): Promise<string> {
    const spec = "@anthropic-ai/sdk"; // non-literal below so TS/typecheck doesn't require it
    let mod: any;
    try {
      mod = await import(spec);
    } catch {
      throw new Error(
        "@anthropic-ai/sdk is not installed. Run `npm install @anthropic-ai/sdk` to enable the " +
          "live drafting path, or run stage-only (no ANTHROPIC_API_KEY) for the deterministic path.",
      );
    }
    const Anthropic = mod.default ?? mod.Anthropic ?? mod;
    const client = new Anthropic({ apiKey: this.opts.apiKey });
    const resp = await client.messages.create({
      model: this.opts.model,
      max_tokens: maxTokens ?? this.opts.maxTokens ?? 2000,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: user }],
    });
    const blocks: any[] = resp?.content ?? [];
    return blocks
      .filter((b) => b?.type === "text")
      .map((b) => b.text as string)
      .join("\n")
      .trim();
  }
}

/**
 * Build the client for a run. A key present ⇒ live drafting (drafting is
 * autonomous-safe "work", so it is NOT gated by TWIN_LIVE — only the executor is).
 * No key ⇒ deterministic dry-run.
 */
export function createLlm(config: { anthropicApiKey?: string; model: string }): LlmClient {
  if (config.anthropicApiKey) {
    return new AnthropicLlm({ apiKey: config.anthropicApiKey, model: config.model });
  }
  return new DryRunLlm();
}
