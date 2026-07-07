import { loadLocalEnv } from '@cortex/config';

// Load a repo-root .env for local runs (no-op in containers). Must precede any
// DB/model access; the config env is read lazily so import order is safe.
loadLocalEnv();

import { closeDb } from '@cortex/db';
import { runIngest } from './ingest';
import { log } from './logger';

const command = process.argv[2] ?? 'help';

async function main(): Promise<void> {
  switch (command) {
    case 'ingest':
      await runIngest();
      break;
    case 'triage':
      log.info('triage: Tier-1 Haiku pass is implemented in Phase 1');
      break;
    case 'synthesize':
      log.info('synthesize: nightly Opus Tomorrow Plan is implemented in Phase 2');
      break;
    case 'help':
    default:
      log.info('CORTEX workers — commands: ingest | triage | synthesize');
      break;
  }
  await closeDb();
}

main().catch((err) => {
  log.error({ err }, 'worker command failed');
  process.exit(1);
});
