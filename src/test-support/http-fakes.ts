/**
 * Test doubles for the HTTP layer. Not a test file (no `.test.ts`), so vitest
 * won't collect it. A fake `fetch` plays back a queue of scripted responses and
 * records every request; a fake `sleep` records delays without waiting.
 */
import { loadConfig, type ImpactConfig } from "../client/config.js";
import { nullLogger } from "../client/logger.js";
import type { HttpDeps } from "../client/http.js";

export interface ResponseSpec {
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
  /** Reject the fetch with this error (simulates a transport failure). */
  throw?: Error;
}

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface FakeFetch {
  fetch: typeof fetch;
  calls: RecordedCall[];
}

export function makeFakeFetch(specs: ResponseSpec[]): FakeFetch {
  const queue = [...specs];
  const calls: RecordedCall[] = [];
  const fetchImpl = async (input: unknown, init?: unknown): Promise<Response> => {
    const req = (init ?? {}) as { method?: string; headers?: Record<string, string>; body?: string };
    calls.push({
      url: String(input),
      method: req.method ?? "GET",
      headers: (req.headers as Record<string, string>) ?? {},
      body: typeof req.body === "string" ? req.body : undefined,
    });
    const spec = queue.shift();
    if (!spec) throw new Error(`fake fetch: no scripted response for call #${calls.length} (${String(input)})`);
    if (spec.throw) throw spec.throw;
    const status = spec.status ?? 200;
    const body = spec.text ?? (spec.json !== undefined ? JSON.stringify(spec.json) : "");
    return new Response(body, { status, headers: spec.headers ?? {} });
  };
  return { fetch: fetchImpl as unknown as typeof fetch, calls };
}

export interface FakeDeps {
  deps: Partial<HttpDeps>;
  sleeps: number[];
  calls: RecordedCall[];
}

/** Build injectable deps: scripted fetch, recording no-wait sleep, fixed jitter. */
export function fakeDeps(specs: ResponseSpec[], random = 0.5): FakeDeps {
  const { fetch, calls } = makeFakeFetch(specs);
  const sleeps: number[] = [];
  return {
    deps: {
      fetch,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
      logger: nullLogger,
      random: () => random,
    },
    sleeps,
    calls,
  };
}

export function testConfig(overrides: Record<string, string> = {}): ImpactConfig {
  return loadConfig({
    env: {
      IMPACT_ACCOUNT_SID: "SID123",
      IMPACT_AUTH_TOKEN: "TOKENabcd",
      IMPACT_PERSONA: "brand",
      HTTP_MAX_RETRIES: "5",
      HTTP_BACKOFF_BASE_MS: "500",
      HTTP_BACKOFF_MAX_MS: "20000",
      HTTP_TIMEOUT_MS: "30000",
      ...overrides,
    },
    argv: [],
  });
}

export function decodeBasic(header: string): { sid: string; token: string } {
  const b64 = header.replace(/^Basic\s+/, "");
  const [sid, token] = Buffer.from(b64, "base64").toString("utf8").split(":");
  return { sid: sid ?? "", token: token ?? "" };
}
