import { loadLocalEnv } from '@cortex/config';

// Load a repo-root .env for local runs (no-op in containers). Env is read lazily
// so import order is safe.
loadLocalEnv();

import { closeDb, reconcileLoops } from '@cortex/db';
import { runIngest } from './ingest';
import { log } from './logger';
import { runSynthesis } from './synthesize';
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
    case 'loops':
      await reconcileLoops();
      log.info('loops reconciled');
      break;
    case 'sync': {
      const ingest = await runIngest();
      const triage = await runTriage();
      await reconcileLoops();
      log.info({ ...ingest, ...triage }, 'sync complete (ingest + triage + loops)');
      break;
    }
    case 'synthesize':
      log.info(await runSynthesis(), 'synthesis complete');
      break;
    case 'help':
    default:
      log.info('CORTEX workers — commands: ingest | triage | loops | sync | synthesize');
      break;
  }
  await closeDb();
}

main().catch((err) => {
  log.error({ err }, 'worker command failed');
  process.exit(1);
});
