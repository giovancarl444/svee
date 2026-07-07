import { getEnv } from '@cortex/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

let pool: Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;
let testDb: NodePgDatabase<typeof schema> | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getEnv().DATABASE_URL, connectionTimeoutMillis: 10_000 });
  }
  return pool;
}

/** The shared Drizzle client, bound to the full schema. Memoized. */
export function getDb(): NodePgDatabase<typeof schema> {
  if (testDb) return testDb;
  if (!db) db = drizzle(getPool(), { schema });
  return db;
}

export type Database = NodePgDatabase<typeof schema>;

/**
 * Test seam: point the repo layer at an in-WASM Postgres (PGlite) so the real
 * repo functions can be exercised in CI without a live server. The pg and pglite
 * drivers share the query-builder + execute API, so the cast is safe at runtime.
 */
export function setTestDb(client: unknown): void {
  testDb = client as NodePgDatabase<typeof schema>;
}
export function clearTestDb(): void {
  testDb = null;
}

/** For graceful shutdown of workers/scripts. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
