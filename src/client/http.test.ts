import { describe, it, expect } from "vitest";
import { HttpClient, parseRetryAfter } from "./http.js";
import { isImpactError } from "./errors.js";
import { fakeDeps, testConfig, decodeBasic } from "../test-support/http-fakes.js";

describe("HttpClient auth + requests", () => {
  it("sends HTTP Basic auth with SID:token", async () => {
    const { deps, calls } = fakeDeps([{ json: { ok: true } }]);
    const http = new HttpClient(testConfig(), deps);
    await http.get("/Advertisers/SID123/Campaigns");
    const auth = calls[0]!.headers["Authorization"]!;
    expect(auth.startsWith("Basic ")).toBe(true);
    expect(decodeBasic(auth)).toEqual({ sid: "SID123", token: "TOKENabcd" });
    expect(calls[0]!.headers["Accept"]).toBe("application/json");
  });

  it("builds URLs with query params and drops null/undefined", async () => {
    const { deps, calls } = fakeDeps([{ json: {} }]);
    const http = new HttpClient(testConfig(), deps);
    await http.get("/x", { query: { a: 1, b: undefined, c: null, d: ["p", "q"] } });
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("a")).toBe("1");
    expect(url.searchParams.has("b")).toBe(false);
    expect(url.searchParams.has("c")).toBe(false);
    expect(url.searchParams.getAll("d")).toEqual(["p", "q"]);
  });

  it("passes through absolute URLs unchanged (deferred job uris)", async () => {
    const { deps, calls } = fakeDeps([{ json: {} }]);
    const http = new HttpClient(testConfig(), deps);
    await http.get("https://api.impact.com/Advertisers/SID123/Jobs/abc");
    expect(calls[0]!.url).toBe("https://api.impact.com/Advertisers/SID123/Jobs/abc");
  });
});

describe("HttpClient retry + backoff", () => {
  it("retries 429 then succeeds, honouring Retry-After as a floor", async () => {
    const { deps, calls, sleeps } = fakeDeps([
      { status: 429, headers: { "Retry-After": "1" } },
      { json: { ok: true } },
    ]);
    const http = new HttpClient(testConfig(), deps);
    const res = await http.get<{ ok: boolean }>("/x");
    expect(res.data.ok).toBe(true);
    expect(res.attempts).toBe(2);
    expect(calls).toHaveLength(2);
    // full-jitter with random=0.5 gives 250ms, but Retry-After=1s is the floor.
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
  });

  it("retries 5xx with exponential backoff", async () => {
    const { deps, sleeps, calls } = fakeDeps([{ status: 500 }, { status: 503 }, { json: { ok: 1 } }]);
    const http = new HttpClient(testConfig(), deps);
    await http.get("/x");
    expect(calls).toHaveLength(3);
    // base 500, random 0.5 -> attempt1: 0.5*500=250, attempt2: 0.5*1000=500
    expect(sleeps).toEqual([250, 500]);
  });

  it("does NOT retry 401 (auth)", async () => {
    const { deps, calls, sleeps } = fakeDeps([{ status: 401 }]);
    const http = new HttpClient(testConfig(), deps);
    await expect(http.get("/x")).rejects.toMatchObject({ kind: "auth", status: 401 });
    expect(calls).toHaveLength(1);
    expect(sleeps).toHaveLength(0);
  });

  it("does NOT retry 403 (wrong persona/scope)", async () => {
    const { deps, calls } = fakeDeps([{ status: 403 }]);
    const http = new HttpClient(testConfig(), deps);
    await expect(http.get("/x")).rejects.toMatchObject({ kind: "forbidden", status: 403 });
    expect(calls).toHaveLength(1);
  });

  it("gives up after maxRetries and throws the classified error", async () => {
    const { deps, calls, sleeps } = fakeDeps([{ status: 429 }, { status: 429 }, { status: 429 }]);
    const http = new HttpClient(testConfig({ HTTP_MAX_RETRIES: "2" }), deps);
    const err = await http.get("/x").catch((e) => e);
    expect(isImpactError(err) && err.kind).toBe("rate_limited");
    expect(calls).toHaveLength(3); // 1 initial + 2 retries
    expect(sleeps).toHaveLength(2);
  });

  it("retries transport/network errors", async () => {
    const { deps, calls } = fakeDeps([
      { throw: new Error("ECONNRESET") },
      { throw: new Error("ECONNRESET") },
      { json: { ok: 1 } },
    ]);
    const http = new HttpClient(testConfig(), deps);
    const res = await http.get<{ ok: number }>("/x");
    expect(res.data.ok).toBe(1);
    expect(calls).toHaveLength(3);
  });

  it("classifies AbortError as timeout (retryable)", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const { deps, calls } = fakeDeps([{ throw: abort }, { json: { ok: 1 } }]);
    const http = new HttpClient(testConfig(), deps);
    const res = await http.get<{ ok: number }>("/x");
    expect(res.data.ok).toBe(1);
    expect(calls).toHaveLength(2);
  });
});

describe("parseRetryAfter", () => {
  it("parses integer seconds", () => {
    expect(parseRetryAfter("5")).toBe(5);
  });
  it("parses HTTP-date to seconds-from-now", () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const secs = parseRetryAfter(future);
    expect(secs).toBeGreaterThanOrEqual(8);
    expect(secs).toBeLessThanOrEqual(11);
  });
  it("returns undefined for junk / null", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});
