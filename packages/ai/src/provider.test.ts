import { resetEnvCache } from '@cortex/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProvider, resetProviderCache } from './provider';

/**
 * The OpenAI-compatible provider is exercised with a stubbed `fetch` — no
 * network. We assert it (a) reads a forced tool/function call, (b) falls back to
 * parsing JSON out of prose content, and (c) returns prose + usage for text().
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { category: { type: 'string' }, urgency: { type: 'integer' } },
  required: ['category', 'urgency'],
} as const;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://test';
  process.env.CORTEX_MODEL_PROVIDER = 'openai';
  process.env.CORTEX_OPENAI_BASE_URL = 'http://localhost:11434/v1';
  process.env.CORTEX_OPENAI_API_KEY = 'ollama';
  resetEnvCache();
  resetProviderCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CORTEX_MODEL_PROVIDER;
  delete process.env.CORTEX_OPENAI_BASE_URL;
  delete process.env.CORTEX_OPENAI_API_KEY;
  resetEnvCache();
  resetProviderCache();
});

describe('OpenAI-compatible provider', () => {
  it('reads a forced function/tool call and reports usage', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { function: { name: 'record_triage', arguments: '{"category":"action_required","urgency":3}' } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 18 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = getProvider();
    expect(provider.kind).toBe('openai');
    const { data, usage } = await provider.structured<{ category: string; urgency: number }>({
      model: 'qwen3',
      system: 'triage',
      payload: { source: 'gmail' },
      tool: { name: 'record_triage', description: 'record it', schema: SCHEMA },
      maxTokens: 400,
    });

    expect(data).toEqual({ category: 'action_required', urgency: 3 });
    expect(usage).toEqual({ input: 120, output: 18 });

    // It hit the OpenAI-compatible chat-completions path with a Bearer header.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer ollama' });
  });

  it('falls back to extracting JSON from prose when there is no tool call', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          { message: { content: 'Sure!\n```json\n{"category":"financial","urgency":1}\n```' } },
        ],
        usage: { prompt_tokens: 90, completion_tokens: 12 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { data } = await getProvider().structured<{ category: string; urgency: number }>({
      model: 'qwen3',
      system: 'triage',
      payload: {},
      tool: { name: 'record_triage', description: 'record it', schema: SCHEMA },
      maxTokens: 400,
    });
    expect(data).toEqual({ category: 'financial', urgency: 1 });
  });

  it('returns prose + usage for a text() call', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: '# Tomorrow\n\nSign the contract.  ' } }],
        usage: { prompt_tokens: 200, completion_tokens: 40 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { text, usage } = await getProvider().text({
      model: 'qwen3',
      system: 'synth',
      payload: {},
      maxTokens: 2000,
    });
    expect(text).toBe('# Tomorrow\n\nSign the contract.');
    expect(usage).toEqual({ input: 200, output: 40 });
  });

  it('surfaces a clear error on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('model not found', { status: 404 })),
    );
    await expect(
      getProvider().text({ model: 'nope', system: 's', payload: {}, maxTokens: 10 }),
    ).rejects.toThrow(/returned 404/);
  });
});
