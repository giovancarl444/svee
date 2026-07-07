import { getEnv } from '@cortex/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

let pool: Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getEnv().DATABASE_URL, connectionTimeoutMillis: 10_000 });
  }
  return pool;
}

/** The shared Drizzle client, bound to the full schema. Memoized. */
export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) db = drizzle(getPool(), { schema });
  return db;
}

export type Database = NodePgDatabase<typeof schema>;

/** For graceful shutdown of workers/scripts. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
