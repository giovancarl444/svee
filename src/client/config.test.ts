import { describe, it, expect } from "vitest";
import { loadConfig, requireCredentials, hasCredentials, activeVersion } from "./config.js";

const baseEnv = { IMPACT_ACCOUNT_SID: "SID", IMPACT_AUTH_TOKEN: "TOK" };

describe("loadConfig", () => {
  it("applies documented defaults", () => {
    const c = loadConfig({ env: baseEnv, argv: [] });
    expect(c.persona).toBe("brand");
    expect(c.apiHost).toBe("https://api.impact.com");
    expect(c.defaultCurrency).toBe("SEK");
    expect(c.defaultTimezone).toBe("Europe/Stockholm");
    expect(c.regionCompliance).toBe("EU_GDPR");
    expect(c.http.maxRetries).toBe(5);
    expect(c.db.retentionDays).toBe(395);
  });

  it("rejects an invalid persona", () => {
    expect(() => loadConfig({ env: { ...baseEnv, IMPACT_PERSONA: "publisher" }, argv: [] })).toThrow(/IMPACT_PERSONA/);
  });

  it("pins per-persona versions", () => {
    const c = loadConfig({ env: { ...baseEnv, IMPACT_PERSONA: "partner", IMPACT_PARTNER_VERSION: "16" }, argv: [] });
    expect(activeVersion(c)).toBe("16");
  });

  it("strips a trailing slash from the host", () => {
    const c = loadConfig({ env: { ...baseEnv, IMPACT_API_HOST: "https://api.impact.com/" }, argv: [] });
    expect(c.apiHost).toBe("https://api.impact.com");
  });

  describe("live/dry-run gate", () => {
    it("defaults to dry-run", () => {
      expect(loadConfig({ env: baseEnv, argv: [] }).live).toBe(false);
    });
    it("--live flag enables live", () => {
      expect(loadConfig({ env: baseEnv, argv: ["--live"] }).live).toBe(true);
    });
    it("IMPACT_LIVE=1 enables live", () => {
      expect(loadConfig({ env: { ...baseEnv, IMPACT_LIVE: "1" }, argv: [] }).live).toBe(true);
    });
    it("--dry-run overrides IMPACT_LIVE=1", () => {
      expect(loadConfig({ env: { ...baseEnv, IMPACT_LIVE: "1" }, argv: ["--dry-run"] }).live).toBe(false);
    });
  });

  describe("credentials", () => {
    it("hasCredentials reflects presence", () => {
      expect(hasCredentials(loadConfig({ env: baseEnv, argv: [] }))).toBe(true);
      expect(hasCredentials(loadConfig({ env: {}, argv: [] }))).toBe(false);
    });
    it("requireCredentials throws a helpful error when absent", () => {
      const c = loadConfig({ env: {}, argv: [] });
      expect(() => requireCredentials(c)).toThrow(/IMPACT_ACCOUNT_SID.*IMPACT_AUTH_TOKEN/s);
    });
  });
});
