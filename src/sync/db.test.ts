import { describe, it, expect } from "vitest";
import { buildUpsert } from "./db.js";

describe("buildUpsert", () => {
  it("renders a single-row upsert with EXCLUDED updates and a synced_at touch", () => {
    const { text, values } = buildUpsert("actions", [{ id: "1", name: "a" }], ["id"]);
    expect(text).toBe(
      "INSERT INTO actions (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, synced_at = now()",
    );
    expect(values).toEqual(["1", "a"]);
  });

  it("emits one tuple per row with incrementing placeholders", () => {
    const { text, values } = buildUpsert("t", [{ id: "1", n: "a" }, { id: "2", n: "b" }], ["id"]);
    expect(text).toContain("VALUES ($1, $2), ($3, $4)");
    expect(values).toEqual(["1", "a", "2", "b"]);
  });

  it("unions heterogeneous row keys, binding missing keys to null", () => {
    const { text, values } = buildUpsert("t", [{ id: "1", name: "a" }, { id: "2", extra: "x" }], ["id"]);
    expect(text).toContain("(id, name, extra)");
    expect(values).toEqual(["1", "a", null, "2", null, "x"]);
  });

  it("falls back to DO NOTHING when there is nothing to update", () => {
    const { text } = buildUpsert("t", [{ id: "1" }], ["id"], { touchColumn: null });
    expect(text).toContain("ON CONFLICT (id) DO NOTHING");
  });

  it("respects an explicit updateColumns list", () => {
    const { text } = buildUpsert("t", [{ id: "1", a: "x", b: "y" }], ["id"], { updateColumns: ["a"], touchColumn: null });
    expect(text).toContain("DO UPDATE SET a = EXCLUDED.a");
    expect(text).not.toContain("b = EXCLUDED.b");
  });

  it("dedupes rows sharing a conflict key, keeping the last occurrence", () => {
    // Two API pages carrying the same natural key would otherwise make Postgres
    // abort the whole statement ("cannot affect row a second time").
    const { text, values } = buildUpsert("t", [{ id: "1", n: "a" }, { id: "1", n: "b" }], ["id"]);
    expect(text).toContain("VALUES ($1, $2)"); // single tuple, not two
    expect(text).not.toContain("$3");
    expect(values).toEqual(["1", "b"]); // last write wins
  });

  it("dedupes on a composite conflict key", () => {
    const { values } = buildUpsert(
      "catalog_items",
      [{ catalog_id: "c", catalog_item_id: "1", n: "a" }, { catalog_id: "c", catalog_item_id: "1", n: "b" }],
      ["catalog_id", "catalog_item_id"],
    );
    expect(values).toEqual(["c", "1", "b"]);
  });

  it("throws on empty input", () => {
    expect(() => buildUpsert("t", [], ["id"])).toThrow();
  });
});
