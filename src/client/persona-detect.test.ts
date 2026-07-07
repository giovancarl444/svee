import { describe, it, expect } from "vitest";
import { HttpClient } from "./http.js";
import { detectPersona } from "./persona-detect.js";
import { fakeDeps, testConfig } from "../test-support/http-fakes.js";

// Probe order is brand, partner, agency.
describe("detectPersona", () => {
  it("detects the single persona that returns 200", async () => {
    const { deps } = fakeDeps([{ status: 200, json: {} }, { status: 403 }, { status: 403 }]);
    const http = new HttpClient(testConfig(), deps);
    const result = await detectPersona(http, testConfig());
    expect(result.detected).toBe("brand");
    expect(result.matchesConfig).toBe(true);
    expect(result.ambiguous).toBe(false);
    expect(result.probes.map((p) => p.status)).toEqual([200, 403, 403]);
  });

  it("flags ambiguity when more than one returns 200", async () => {
    const { deps } = fakeDeps([{ status: 200, json: {} }, { status: 200, json: {} }, { status: 403 }]);
    const http = new HttpClient(testConfig(), deps);
    const result = await detectPersona(http, testConfig());
    expect(result.detected).toBeNull();
    expect(result.ambiguous).toBe(true);
  });

  it("returns null when nothing authorises", async () => {
    const { deps } = fakeDeps([{ status: 401 }, { status: 401 }, { status: 401 }]);
    const http = new HttpClient(testConfig(), deps);
    const result = await detectPersona(http, testConfig());
    expect(result.detected).toBeNull();
    expect(result.ambiguous).toBe(false);
  });

  it("reports mismatch when detected != configured", async () => {
    // configured brand, but only partner returns 200
    const { deps } = fakeDeps([{ status: 403 }, { status: 200, json: {} }, { status: 403 }]);
    const http = new HttpClient(testConfig(), deps);
    const result = await detectPersona(http, testConfig({ IMPACT_PERSONA: "brand" }));
    expect(result.detected).toBe("partner");
    expect(result.matchesConfig).toBe(false);
  });
});
