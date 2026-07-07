/**
 * Database layer for the sync warehouse. Postgres/Supabase via `pg`.
 *
 * The important, testable part is `buildUpsert` — a pure function that renders a
 * parameterized multi-row `INSERT ... ON CONFLICT DO UPDATE`. Idempotency lives
 * here: conflicting natural keys UPDATE instead of duplicating, so re-running a
 * sync is always a no-op on unchanged data.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ImpactConfig } from "../client/config.js";

export type Row = Record<string, unknown>;

export interface UpsertOptions {
  /** Columns to update on conflict (default: all non-conflict columns). */
  updateColumns?: string[];
  /** Column bumped to now() on every write for observability (default synced_at). */
  touchColumn?: string | null;
}

export interface Database {
  query<T = Row>(text: string, values?: unknown[]): Promise<T[]>;
  upsert(table: string, rows: Row[], conflictColumns: string[], options?: UpsertOptions): Promise<number>;
  close(): Promise<void>;
}

/**
 * Render a parameterized multi-row upsert. Columns are taken from the union of
 * all row keys (missing keys bind to NULL), so heterogeneous rows are safe.
 */
/**
 * Collapse rows that share the same conflict-key tuple, keeping the LAST
 * occurrence. Postgres rejects a single `INSERT ... ON CONFLICT DO UPDATE` whose
 * VALUES contain the same conflict key twice ("cannot affect row a second time")
 * — and two API pages can legitimately carry the same natural key. Last-wins
 * matches the intent of an idempotent upsert.
 */
export function dedupeByConflict(rows: Row[], conflictColumns: string[]): Row[] {
  const byKey = new Map<string, Row>();
  for (const row of rows) {
    const key = JSON.stringify(conflictColumns.map((c) => row[c] ?? null));
    byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

export function buildUpsert(
  table: string,
  rows: Row[],
  conflictColumns: string[],
  options: UpsertOptions = {},
): { text: string; values: unknown[] } {
  if (rows.length === 0) throw new Error("buildUpsert: no rows");
  const deduped = dedupeByConflict(rows, conflictColumns);
  const columns = Array.from(new Set(deduped.flatMap((r) => Object.keys(r))));
  if (columns.length === 0) throw new Error("buildUpsert: rows have no columns");

  const values: unknown[] = [];
  const tuples = deduped.map((row) => {
    const placeholders = columns.map((col) => {
      values.push(row[col] ?? null);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  const touch = options.touchColumn === undefined ? "synced_at" : options.touchColumn;
  const updatable = (options.updateColumns ?? columns.filter((c) => !conflictColumns.includes(c))).filter(
    (c) => !conflictColumns.includes(c),
  );
  const setClauses = updatable.map((c) => `${c} = EXCLUDED.${c}`);
  if (touch && !columns.includes(touch)) setClauses.push(`${touch} = now()`);

  const onConflict =
    setClauses.length > 0
      ? `ON CONFLICT (${conflictColumns.join(", ")}) DO UPDATE SET ${setClauses.join(", ")}`
      : `ON CONFLICT (${conflictColumns.join(", ")}) DO NOTHING`;

  const text =
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")} ${onConflict}`.trim();
  return { text, values };
}

/** Postgres-backed database (Supabase uses Postgres). */
export class PgDatabase implements Database {
  private pool: import("pg").Pool | undefined;
  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  private async getPool(): Promise<import("pg").Pool> {
    if (!this.pool) {
      const pg = (await import("pg")).default;
      this.pool = new pg.Pool({ connectionString: this.connectionString, max: 5 });
    }
    return this.pool;
  }

  async query<T = Row>(text: string, values: unknown[] = []): Promise<T[]> {
    const pool = await this.getPool();
    const res = await pool.query(text, values);
    return res.rows as T[];
  }

  async upsert(table: string, rows: Row[], conflictColumns: string[], options?: UpsertOptions): Promise<number> {
    if (rows.length === 0) return 0;
    const pool = await this.getPool();
    // Dedupe across the WHOLE batch first (last-wins), so a conflict key split
    // across two chunks can't produce inconsistent results or a crash.
    const deduped = dedupeByConflict(rows, conflictColumns);
    // Chunk to stay well under Postgres' 65535 bind-parameter limit.
    const colCount = Math.max(1, new Set(deduped.flatMap((r) => Object.keys(r))).size);
    const chunkSize = Math.max(1, Math.floor(60000 / colCount));
    let affected = 0;
    for (let i = 0; i < deduped.length; i += chunkSize) {
      const chunk = deduped.slice(i, i + chunkSize);
      const { text, values } = buildUpsert(table, chunk, conflictColumns, options);
      const res = await pool.query(text, values);
      affected += res.rowCount ?? 0;
    }
    return affected;
  }

  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
  }
}

/** Placeholder database for DB=none — fails loudly if a write is attempted. */
export class NullDatabase implements Database {
  async query<T = Row>(): Promise<T[]> {
    throw new Error("DB=none: no database configured. Set DB=supabase|postgres and DATABASE_URL in .env.local.");
  }
  async upsert(): Promise<number> {
    throw new Error("DB=none: no database configured. Set DB=supabase|postgres and DATABASE_URL in .env.local.");
  }
  async close(): Promise<void> {}
}

export function createDatabase(config: ImpactConfig): Database {
  const { driver, url } = config.db;
  if (driver === "none") return new NullDatabase();
  if (driver === "sqlite") {
    throw new Error(
      "DB=sqlite is not wired in this build (avoids a native dependency). Install better-sqlite3 and implement a " +
        "SqliteDatabase, or use DB=postgres/supabase.",
    );
  }
  // postgres | supabase
  if (!url) {
    throw new Error(
      `DB=${driver} requires DATABASE_URL (the Postgres connection string; Supabase provides one under ` +
        `Project Settings → Database). Set it in .env.local.`,
    );
  }
  return new PgDatabase(url);
}

/** Apply schema.sql (idempotent). */
export async function applySchema(db: Database): Promise<void> {
  const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));
  const sql = readFileSync(schemaPath, "utf8");
  await db.query(sql);
}
