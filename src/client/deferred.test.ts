import { describe, it, expect } from "vitest";
import { HttpClient } from "./http.js";
import { runDeferredExport } from "./deferred.js";
import { fakeDeps, testConfig } from "../test-support/http-fakes.js";

const noWait = { sleep: async () => {} };

describe("runDeferredExport", () => {
  it("returns immediately when the endpoint answers synchronously", async () => {
    const { deps, calls } = fakeDeps([{ json: { "@total": "2", Records: [{ a: 1 }, { a: 2 }] } }]);
    const http = new HttpClient(testConfig(), deps);
    const res = await runDeferredExport(http, "/x", { ...noWait });
    expect(res.polls).toBe(0);
    expect(res.status).toBe("COMPLETED");
    expect(calls).toHaveLength(1);
  });

  it("submits, polls until COMPLETED, then downloads ResultUri", async () => {
    const { deps, calls } = fakeDeps([
      { json: { Status: "QUEUED", QueuedUri: "/Advertisers/SID123/Jobs/1" } },
      { json: { Status: "RUNNING", QueuedUri: "/Advertisers/SID123/Jobs/1" } },
      { json: { Status: "COMPLETED", ResultUri: "/Advertisers/SID123/Jobs/1/download" } },
      { json: { Records: [{ x: 1 }] } },
    ]);
    const http = new HttpClient(testConfig(), deps);
    const res = await runDeferredExport<{ Records: unknown[] }>(http, "/submit", { sleep: async () => {} });
    expect(res.polls).toBe(2);
    expect(res.data.Records).toHaveLength(1);
    expect(calls).toHaveLength(4);
    expect(calls[3]!.url).toContain("/download");
  });

  it("throws when the job ends FAILED", async () => {
    const { deps } = fakeDeps([
      { json: { Status: "QUEUED", QueuedUri: "/job/1" } },
      { json: { Status: "FAILED" } },
    ]);
    const http = new HttpClient(testConfig(), deps);
    await expect(runDeferredExport(http, "/submit", { sleep: async () => {} })).rejects.toMatchObject({
      kind: "server",
    });
  });

  it("throws deferred_timeout when the deadline passes", async () => {
    let t = 0;
    const times = [0, 5000, 5000]; // deadline calc, then past-deadline checks
    const now = () => times[Math.min(t++, times.length - 1)]!;
    const { deps } = fakeDeps([{ json: { Status: "QUEUED", QueuedUri: "/job/1" } }]);
    const http = new HttpClient(testConfig(), deps);
    await expect(
      runDeferredExport(http, "/submit", { sleep: async () => {}, now, maxWaitMs: 1000 }),
    ).rejects.toMatchObject({ kind: "deferred_timeout" });
  });
});
