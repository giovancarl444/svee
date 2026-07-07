import { loadLocalEnv } from '@cortex/config';

// Load a repo-root .env for local runs (no-op in containers). Env is read lazily
// so import order is safe.
loadLocalEnv();

import { closeDb } from '@cortex/db';
import { runIngest } from './ingest';
import { log } from './logger';
import { runTriage } from './triage';

const command = process.argv[2] ?? 'help';

async function main(): Promise<void> {
  switch (command) {
    case 'ingest':
      log.info(await runIngest(), 'ingest complete');
      break;
    case 'triage':
      log.info(await runTriage(), 'triage complete');
      break;
    case 'sync': {
      const ingest = await runIngest();
      const triage = await runTriage();
      log.info({ ...ingest, ...triage }, 'sync complete (ingest + triage)');
      break;
    }
    case 'synthesize':
      log.info('synthesize: nightly Opus Tomorrow Plan is implemented in Phase 2');
      break;
    case 'help':
    default:
      log.info('CORTEX workers — commands: ingest | triage | sync | synthesize');
      break;
  }
  await closeDb();
}

main().catch((err) => {
  log.error({ err }, 'worker command failed');
  process.exit(1);
});
