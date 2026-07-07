import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEnv, loadLocalEnv } from '@cortex/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// CLI entrypoint: load a repo-root .env if present (no-op in containers).
loadLocalEnv();

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: getEnv().DATABASE_URL });
  const db = drizzle(pool);
  console.log(`[cortex] applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log('[cortex] migrations applied.');
}

main().catch((err) => {
  console.error('[cortex] migration failed:', err);
  process.exit(1);
});
