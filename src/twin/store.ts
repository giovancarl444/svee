/**
 * Twin persistence layer. Reuses the sync layer's `Database` / `buildUpsert`
 * primitives (idempotent, chunked, parameterized) so the two subsystems share one
 * DB abstraction. `runTwin` itself never touches the DB — the script reads state
 * and applies writes through here, keeping the orchestrator pure and testable.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  NullDatabase,
  PgDatabase,
  type Database,
  type Row,
} from "../sync/db.js";
import type { TwinConfig } from "./config.js";
import type { ApprovalRequest, Digest, PipelineWrite } from "./contracts.js";

/** Build the twin DB from config (shares DATABASE_URL with the sync layer). */
export function createTwinDatabase(config: TwinConfig): Database {
  const { driver, url, password } = config.db;
  if (driver === "none") return new NullDatabase();
  if (!url) {
    throw new Error(
      `DB=${driver} requires DATABASE_URL (the Supabase/Postgres connection string). Set it in .env.local.`,
    );
  }
  return new PgDatabase(url, password);
}

/** Apply the twin schema (idempotent). */
export async function applyTwinSchema(db: Database): Promise<void> {
  const path = fileURLToPath(new URL("./schema.sql", import.meta.url));
  await db.query(readFileSync(path, "utf8"));
}

// ── Conflict keys per pipeline table ──────────────────────────────────────────
const CONFLICT: Record<PipelineWrite["table"], string> = {
  jobs: "job_key",
  applications: "id",
  messages: "id",
};
const TABLE: Record<PipelineWrite["table"], string> = {
  jobs: "twin_jobs",
  applications: "twin_applications",
  messages: "twin_messages",
};

/** Route pipeline_writes to the right tables via idempotent upserts. */
export async function applyPipelineWrites(db: Database, writes: PipelineWrite[]): Promise<number> {
  const byTable = new Map<PipelineWrite["table"], Row[]>();
  for (const w of writes) {
    const list = byTable.get(w.table) ?? [];
    list.push(w.record as Row);
    byTable.set(w.table, list);
  }
  let n = 0;
  for (const [table, rows] of byTable) {
    n += await db.upsert(TABLE[table], rows, [CONFLICT[table]]);
  }
  return n;
}

/** Persist the approval queue rows (idempotent on id). */
export async function insertApprovals(db: Database, approvals: ApprovalRequest[]): Promise<number> {
  if (!approvals.length) return 0;
  const rows: Row[] = approvals.map((a) => ({
    id: a.id,
    type: a.type,
    company: a.company,
    role: a.role,
    url: a.url,
    channel: a.channel,
    cv_variant: a.cv_variant,
    status: "pending",
    fit_score: a.fit_score,
    action_on_approve: a.action_on_approve,
    payload: {
      cover_letter: a.cover_letter,
      screening_answers: a.screening_answers,
      missing_fields: a.missing_fields,
    },
    created_at: new Date().toISOString(),
  }));
  return db.upsert("twin_approvals", rows, ["id"]);
}

/** Persist the digest (idempotent on id). */
export async function insertDigest(db: Database, id: string, digest: Digest): Promise<number> {
  const row: Row = {
    id,
    run_at: digest.run_at,
    found: digest.found,
    scored: digest.scored,
    passed_threshold: digest.passed_threshold,
    staged: digest.staged,
    submitted_prev_run: digest.submitted_prev_run,
    discarded_low_fit: digest.discarded_low_fit,
    needs_decision: digest.needs_decision,
    top_matches: digest.top_matches,
  };
  return db.upsert("twin_digests", [row], ["id"]);
}

/** Snapshot the KB (versioned, diffable). */
export async function upsertKbSnapshot(db: Database, version: string, kb: unknown): Promise<number> {
  return db.upsert("twin_kb", [{ version, kb }], ["version"], { touchColumn: null });
}

// ── State reads for the orchestrator ──────────────────────────────────────────

const CLOSED_STATUSES = ["rejected", "ghosted", "withdrawn"];

/**
 * company::role keys of applications that are still LIVE (not closed). The
 * orchestrator dedupes intake against this set — "never re-apply to a live
 * application".
 */
export async function liveApplicationKeys(db: Database): Promise<Set<string>> {
  const rows = await db.query<{ company: string; role: string }>(
    `SELECT company, role FROM twin_applications WHERE status NOT IN ('rejected','ghosted','withdrawn')`,
  );
  return new Set(rows.map((r) => `${(r.company ?? "").toLowerCase()}::${(r.role ?? "").toLowerCase()}`));
}

/** Run timestamp of the previous digest, if any (for submitted_prev_run). */
export async function previousDigestRunAt(db: Database): Promise<string | null> {
  const rows = await db.query<{ run_at: string }>(
    `SELECT run_at FROM twin_digests ORDER BY run_at DESC LIMIT 1`,
  );
  return rows[0]?.run_at ?? null;
}

/** Applications submitted since a given time (for submitted_prev_run). */
export async function countSubmittedSince(db: Database, sinceIso: string | null): Promise<number> {
  if (!sinceIso) return 0;
  const rows = await db.query<{ n: number }>(
    `SELECT count(*)::int n FROM twin_applications WHERE status = 'submitted' AND submitted_at >= $1`,
    [sinceIso],
  );
  return rows[0]?.n ?? 0;
}

/**
 * SUBMITTED applications past their follow-up window with no reply — the "no
 * reply after N days on a high-fit role → draft ONE polite nudge" trigger.
 * Targets `submitted` (not `staged`: a staged application was never actually
 * sent, so there is nothing to follow up on). Excludes anything that already has
 * a follow-up approval, so the twin never drafts more than ONE unsolicited nudge
 * per application. Wait is measured from submission.
 */
export async function dueFollowups(
  db: Database,
  nowIso: string,
): Promise<Array<{ applicationId: string; company: string; role: string; channel: string; daysWaiting: number }>> {
  const rows = await db.query<{ id: string; company: string; role: string; channel: string; days: number }>(
    `SELECT a.id, a.company, a.role, a.channel,
            GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - COALESCE(a.submitted_at, a.created_at))) / 86400)::int AS days
       FROM twin_applications a
      WHERE a.status = 'submitted'
        AND a.followup_due IS NOT NULL AND a.followup_due <= $1::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM twin_messages m
           WHERE m.application_id = a.id AND m.direction = 'inbound'
        )
        AND NOT EXISTS (
          SELECT 1 FROM twin_approvals ap
           WHERE ap.type = 'send_followup'
             AND lower(ap.company) = lower(a.company) AND lower(ap.role) = lower(a.role)
        )`,
    [nowIso],
  );
  return rows.map((r) => ({
    applicationId: r.id,
    company: r.company,
    role: r.role,
    channel: r.channel,
    daysWaiting: Number(r.days),
  }));
}

/** The pending approval queue (for the Cortex view / API). */
export async function pendingApprovals(db: Database): Promise<Row[]> {
  return db.query(`SELECT * FROM twin_approvals WHERE status = 'pending' ORDER BY fit_score DESC NULLS LAST`);
}

/** The most recent digest (for the Cortex view / API). */
export async function latestDigest(db: Database): Promise<Row | null> {
  const rows = await db.query(`SELECT * FROM twin_digests ORDER BY run_at DESC LIMIT 1`);
  return rows[0] ?? null;
}
