import { describe, it, expect } from "vitest";
import { buildReadiness } from "./readiness.js";
import { loadTwinConfig } from "./config.js";
import { fixtureKb } from "./test-support.js";
import { loadKb } from "./kb.js";

const config = loadTwinConfig({ env: {}, argv: [] });

describe("buildReadiness", () => {
  it("is READY only when KB is filled, DB connected, and Sphere wired", () => {
    const r = buildReadiness({ kb: fixtureKb(), missing: [], config, dbConnected: true, sphereWired: true });
    expect(r.ready).toBe(true);
    expect(r.blockers).toHaveLength(0);
    // Every section reports ok.
    expect(r.sections.every((s) => s.ok)).toBe(true);
  });

  it("flags the go-live blockers: KB slots, no DB, inert Sphere", () => {
    const { kb, missing } = loadKb(); // bundled KB still has flagged slots
    const r = buildReadiness({ kb, missing, config, dbConnected: false, sphereWired: false });
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => /KB slot/i.test(b))).toBe(true);
    expect(r.blockers.some((b) => /DATABASE_URL|DB=/i.test(b))).toBe(true);
    expect(r.blockers.some((b) => /SphereExecutor/i.test(b))).toBe(true);
  });

  it("channels are always ready (prepared to the last click)", () => {
    const r = buildReadiness({ kb: fixtureKb(), missing: [], config, dbConnected: true, sphereWired: false });
    const chan = r.sections.find((s) => s.name === "Channels")!;
    expect(chan.ok).toBe(true);
    expect(chan.detail).toMatch(/prepared/);
  });
});
