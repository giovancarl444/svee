import { loadLocalEnv } from '@cortex/config';

// Load a repo-root .env for local runs (no-op in containers). Env is read lazily
// so import order is safe.
loadLocalEnv();

import { closeDb, reconcileLoops } from '@cortex/db';
import { runEscalation } from './escalate';
import { runIngest } from './ingest';
import { log } from './logger';
import { serve } from './scheduler';
import { runSynthesis } from './synthesize';
import { runTriage } from './triage';

const command = process.argv[2] ?? 'help';

async function main(): Promise<void> {
  // The always-on scheduler runs indefinitely; timers keep the process alive and
  // the DB pool stays open, so it returns before the closeDb() below.
  if (command === 'serve') {
    await serve();
    return;
  }

  switch (command) {
    case 'ingest':
      log.info(await runIngest(), 'ingest complete');
      break;
    case 'triage':
      log.info(await runTriage(), 'triage complete');
      break;
    case 'escalate':
      log.info(await runEscalation(), 'escalation complete');
      break;
    case 'loops':
      await reconcileLoops();
      log.info('loops reconciled');
      break;
    case 'sync': {
      const ingest = await runIngest();
      const triage = await runTriage();
      const escalation = await runEscalation();
      await reconcileLoops();
      log.info({ ...ingest, ...triage, ...escalation }, 'sync complete (ingest + triage + escalate + loops)');
      break;
    }
    case 'synthesize':
      log.info(await runSynthesis(), 'synthesis complete');
      break;
    case 'help':
    default:
      log.info('CORTEX workers — commands: serve | ingest | triage | escalate | loops | sync | synthesize');
      break;
  }
  await closeDb();
}

main().catch((err) => {
  log.error({ err }, 'worker command failed');
  process.exit(1);
});
