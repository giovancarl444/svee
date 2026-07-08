import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { describe, expect, it } from 'vitest';
import * as schema from './schema';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const EXPECTED_TABLES = [
  'entities',
  'threads',
  'items',
  'classifications',
  'open_loops',
  'briefs',
  'api_calls',
  'connectors',
];

describe('migrations', () => {
  it('apply cleanly to a fresh Postgres and create every spine table', async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });

    await migrate(db, { migrationsFolder });

    const res = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const names = (res.rows as Array<{ table_name: string }>).map((r) => r.table_name);
    for (const t of EXPECTED_TABLES) {
      expect(names, `missing table: ${t}`).toContain(t);
    }

    await client.close();
  });
});
