import { describe, it, expect } from "vitest";
import { redactSecret, redact } from "./logger.js";

describe("redactSecret", () => {
  it("keeps only the last 4 characters", () => {
    expect(redactSecret("abcd1234")).toBe("****1234");
  });
  it("fully masks short values", () => {
    expect(redactSecret("abc")).toBe("****");
    expect(redactSecret("")).toBe("");
  });
});

describe("redact", () => {
  it("redacts sensitive keys", () => {
    const out = redact({ authToken: "secretvalue", nested: { password: "hunter2xyz" } }) as Record<string, unknown>;
    expect(out.authToken).toBe("****alue");
    expect((out.nested as Record<string, unknown>).password).toBe("****2xyz");
  });

  it("masks emails and long hashes inside strings", () => {
    const out = redact({ note: "mail me at jane@doe.com now" }) as Record<string, string>;
    expect(out.note).toContain("[email]");
    expect(out.note).not.toContain("jane@doe.com");

    const hashOut = redact({ v: "a".repeat(40) }) as Record<string, string>;
    expect(hashOut.v).toBe("[hash:40]");
  });

  it("does not recurse infinitely / caps depth", () => {
    const cyclicish = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(() => redact(cyclicish)).not.toThrow();
  });
});
