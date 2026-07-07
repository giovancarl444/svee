/**
 * Integration test against a REAL Postgres engine (PGlite, in-process). Runs the
 * twin schema.sql, the pipeline upserts, the approval/digest inserts, and the
 * state-read queries (liveApplicationKeys, countSubmittedSince, dueFollowups)
 * against Postgres — the layer string-level tests can't cover.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { buildUpsert, dedupeByConflict, type Database, type Row, type UpsertOptions } from "../sync/db.js";
import {
  applyTwinSchema,
  applyPipelineWrites,
  insertApprovals,
  insertDigest,
  liveApplicationKeys,
  previousDigestRunAt,
  countSubmittedSince,
  dueFollowups,
  pendingApprovals,
  latestDigest,
} from "./store.js";
import type { ApprovalRequest, Digest, PipelineWrite } from "./contracts.js";

function normParams(values: unknown[]): unknown[] {
  return values.map((v) => {
    if (v === null || v === undefined) return v;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") return JSON.stringify(v);
    return v;
  });
}

class PgliteDatabase implements Database {
  constructor(private readonly pg: PGlite) {}
  async query<T = Row>(text: string, values: unknown[] = []): Promise<T[]> {
    if (values.length === 0 && text.split(";").filter((s) => s.trim()).length > 1) {
      await this.pg.exec(text);
      return [] as T[];
    }
    const res = await this.pg.query(text, normParams(values));
    return res.rows as T[];
  }
  async upsert(table: string, rows: Row[], conflictColumns: string[], options?: UpsertOptions): Promise<number> {
    if (rows.length === 0) return 0;
    const deduped = dedupeByConflict(rows, conflictColumns);
    const { text, values } = buildUpsert(table, deduped, conflictColumns, options);
    const res = await this.pg.query(text, normParams(values));
    return res.affectedRows ?? 0;
  }
  async close(): Promise<void> {
    await this.pg.close();
  }
}

let pg: PGlite;
let db: Database;

beforeAll(async () => {
  pg = new PGlite();
  db = new PgliteDatabase(pg);
  await applyTwinSchema(db);
});

afterAll(async () => {
  await db.close();
});

describe("twin schema", () => {
  it("creates every twin table", async () => {
    const rows = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "twin_jobs", "twin_applications", "twin_messages", "twin_approvals", "twin_digests", "twin_kb",
      ]),
    );
  });
});

describe("applyPipelineWrites (idempotent)", () => {
  it("routes writes to the right tables and re-running is a no-op", async () => {
    const writes: PipelineWrite[] = [
      { op: "insert", table: "jobs", record: { job_key: "acme::fs", company: "Acme", role: "FS", fit_score: 84, tier: "prioritize", status: "staged", facts: { a: 1 }, reasons: ["x"] } },
      { op: "insert", table: "applications", record: { id: "app-1", job_key: "acme::fs", company: "Acme", role: "FS", channel: "ats:greenhouse", cv_variant: "A", status: "staged", fit_score: 84, cover_letter: "hi", screening: [{ q: "Q", a: "A" }], missing_fields: [], approval_id: "ap-1", followup_due: "2026-06-01T00:00:00Z", created_at: "2026-05-20T00:00:00Z" } },
      { op: "insert", table: "messages", record: { id: "m-1", application_id: "app-1", direction: "inbound", kind: "rejection", snippet: "no", signals: ["unfortunately"], classified_at: "2026-06-02T00:00:00Z" } },
    ];
    await applyPipelineWrites(db, writes);
    await applyPipelineWrites(db, writes); // idempotent

    const j = await db.query<{ n: number }>("SELECT count(*)::int n FROM twin_jobs");
    const a = await db.query<{ n: number }>("SELECT count(*)::int n FROM twin_applications");
    const m = await db.query<{ n: number }>("SELECT count(*)::int n FROM twin_messages");
    expect(j[0]!.n).toBe(1);
    expect(a[0]!.n).toBe(1);
    expect(m[0]!.n).toBe(1);

    const facts = await db.query<{ facts: unknown }>("SELECT facts FROM twin_jobs WHERE job_key = 'acme::fs'");
    expect(facts[0]!.facts).toEqual({ a: 1 });
  });
});

describe("approvals + digest", () => {
  it("persists approvals as pending and exposes the queue", async () => {
    const approvals: ApprovalRequest[] = [
      {
        id: "ap-9", type: "submit_application", company: "Acme", role: "FS", url: "u",
        channel: "ats:greenhouse", cv_variant: "A", cover_letter: "letter",
        screening_answers: [{ q: "Q", a: "A" }], missing_fields: [], fit_score: 84,
        action_on_approve: "click submit",
      },
    ];
    await insertApprovals(db, approvals);
    const pending = await pendingApprovals(db);
    expect(pending.some((r) => (r as { id: string }).id === "ap-9")).toBe(true);
    const row = pending.find((r) => (r as { id: string }).id === "ap-9") as { status: string; payload: { cover_letter: string } };
    expect(row.status).toBe("pending");
    expect(row.payload.cover_letter).toBe("letter");
  });

  it("persists the digest and reads the latest run timestamp", async () => {
    const digest: Digest = {
      run_at: "2026-06-10T00:00:00.000Z", found: 5, scored: 4, passed_threshold: 2,
      staged: 2, submitted_prev_run: 0, needs_decision: ["x"], top_matches: [], discarded_low_fit: 2,
    };
    await insertDigest(db, "run-1", digest);
    const latest = await latestDigest(db);
    expect((latest as { id: string }).id).toBe("run-1");
    const prev = await previousDigestRunAt(db);
    expect(prev).not.toBeNull();
  });
});

describe("state reads", () => {
  it("liveApplicationKeys excludes closed applications", async () => {
    await db.upsert(
      "twin_applications",
      [{ id: "app-rej", company: "Rej", role: "Role", status: "rejected", created_at: "2026-05-01T00:00:00Z" }],
      ["id"],
    );
    const keys = await liveApplicationKeys(db);
    expect(keys.has("acme::fs")).toBe(true); // staged app-1 above
    expect(keys.has("rej::role")).toBe(false); // rejected
  });

  it("countSubmittedSince counts submitted applications after a cutoff", async () => {
    await db.upsert(
      "twin_applications",
      [{ id: "app-sub", company: "Sub", role: "R", status: "submitted", submitted_at: "2026-06-15T00:00:00Z", created_at: "2026-06-14T00:00:00Z" }],
      ["id"],
    );
    expect(await countSubmittedSince(db, "2026-06-01T00:00:00Z")).toBe(1);
    expect(await countSubmittedSince(db, "2026-07-01T00:00:00Z")).toBe(0);
    expect(await countSubmittedSince(db, null)).toBe(0);
  });

  it("dueFollowups: submitted-only, no reply, and never more than one nudge", async () => {
    await db.upsert(
      "twin_applications",
      [
        // Due: submitted, past followup, no reply, no prior nudge → included.
        { id: "app-due", company: "DueCo", role: "R", status: "submitted", submitted_at: "2026-05-20T00:00:00Z", followup_due: "2026-06-01T00:00:00Z", created_at: "2026-05-19T00:00:00Z" },
        // Staged (never sent) → excluded even though past followup.
        { id: "app-staged", company: "StagedCo", role: "R", status: "staged", followup_due: "2026-06-01T00:00:00Z", created_at: "2026-05-19T00:00:00Z" },
        // Submitted but already got an inbound reply → excluded.
        { id: "app-replied", company: "RepliedCo", role: "R", status: "submitted", submitted_at: "2026-05-20T00:00:00Z", followup_due: "2026-06-01T00:00:00Z", created_at: "2026-05-19T00:00:00Z" },
        // Submitted but already has a follow-up approval → excluded (one nudge only).
        { id: "app-nudged", company: "NudgedCo", role: "R", status: "submitted", submitted_at: "2026-05-20T00:00:00Z", followup_due: "2026-06-01T00:00:00Z", created_at: "2026-05-19T00:00:00Z" },
      ],
      ["id"],
    );
    await db.upsert("twin_messages", [{ id: "reply-1", application_id: "app-replied", direction: "inbound", kind: "other" }], ["id"]);
    await db.upsert("twin_approvals", [{ id: "fu-1", type: "send_followup", company: "NudgedCo", role: "R", status: "pending" }], ["id"]);

    const due = await dueFollowups(db, "2026-06-20T00:00:00Z");
    const ids = due.map((d) => d.applicationId);
    expect(ids).toContain("app-due");
    expect(ids).not.toContain("app-staged");
    expect(ids).not.toContain("app-replied");
    expect(ids).not.toContain("app-nudged");
    expect(due.find((d) => d.applicationId === "app-due")!.daysWaiting).toBeGreaterThan(0);
  });
});
