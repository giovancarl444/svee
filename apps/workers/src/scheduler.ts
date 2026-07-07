import { getEnv } from '@cortex/config';
import { reconcileLoops } from '@cortex/db';
import { runEscalation } from './escalate';
import { runIngest } from './ingest';
import { log } from './logger';
import { runSynthesis } from './synthesize';
import { runTriage } from './triage';

async function syncCycle(): Promise<void> {
  try {
    const ingest = await runIngest();
    const triage = await runTriage();
    const escalation = await runEscalation();
    await reconcileLoops();
    log.info({ ...ingest, ...triage, ...escalation }, 'scheduler: sync cycle complete');
  } catch (err) {
    log.error({ err }, 'scheduler: sync cycle failed (retries next interval)');
  }
}

/** Milliseconds until the next occurrence of `hour`:00 local (in `tz`). */
function msUntilHour(hour: number, tz: string): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const nowSec = get('hour') * 3600 + get('minute') * 60 + get('second');
  let delta = hour * 3600 - nowSec;
  if (delta <= 0) delta += 24 * 3600; // already past today → tomorrow
  return delta * 1000;
}

function scheduleBrief(hour: number, tz: string): void {
  const delay = msUntilHour(hour, tz);
  log.info({ inMinutes: Math.round(delay / 60_000) }, 'scheduler: next Tomorrow Plan scheduled');
  setTimeout(() => {
    void runSynthesis()
      .catch((err) => log.error({ err }, 'scheduler: synthesis failed'))
      .finally(() => scheduleBrief(hour, tz)); // re-arm for the next day
  }, delay);
}

/**
 * The always-on runner (the `serve` command). Runs a sync cycle immediately and
 * then every CORTEX_SYNC_INTERVAL_MIN, and the nightly Opus brief at
 * CORTEX_BRIEF_HOUR. Timers keep the process alive; the DB pool is never closed.
 */
export async function serve(): Promise<void> {
  const env = getEnv();
  log.info(
    { intervalMin: env.CORTEX_SYNC_INTERVAL_MIN, briefHour: env.CORTEX_BRIEF_HOUR, tz: env.CORTEX_TZ },
    'scheduler: starting (always-on)',
  );
  await syncCycle();
  setInterval(() => void syncCycle(), env.CORTEX_SYNC_INTERVAL_MIN * 60_000);
  scheduleBrief(env.CORTEX_BRIEF_HOUR, env.CORTEX_TZ);
}
