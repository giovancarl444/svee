import type { SourceAdapter } from '@cortex/core';
import { wireAdapters } from './adapters';
import { log } from './logger';
import { adapters } from './registry';

export interface DoctorRow {
  source: string;
  connected: boolean;
  authValid: boolean;
  detail?: string;
  error?: string;
}

/**
 * Probe each adapter's read-only `status()` (auth + connectivity). Pure over the
 * given list — no env, no wiring — so it is unit-testable with fakes. A status()
 * that throws is captured as an unhealthy row rather than aborting the sweep.
 */
export async function probeAdapters(list: SourceAdapter[]): Promise<{ rows: DoctorRow[]; ok: boolean }> {
  const rows: DoctorRow[] = [];
  for (const a of list) {
    try {
      const s = await a.status();
      rows.push({
        source: s.source,
        connected: s.connected,
        authValid: s.authValid,
        ...(s.detail ? { detail: s.detail } : {}),
        ...(s.lastError ? { error: s.lastError } : {}),
      });
    } catch (err) {
      rows.push({ source: a.source, connected: false, authValid: false, error: (err as Error).message });
    }
  }
  return { rows, ok: rows.every((r) => r.authValid) };
}

/**
 * Connector preflight (`pnpm --filter @cortex/workers doctor`). Registers every
 * source configured in env, probes each read-only, and reports — WITHOUT
 * ingesting anything. Turns a first-connect credential/connectivity problem into
 * a clear per-source diagnostic instead of a confusing failed sync. Exits
 * non-zero (via the caller) when any configured source is unhealthy.
 */
export async function runDoctor(): Promise<{ rows: DoctorRow[]; ok: boolean }> {
  wireAdapters();
  const list = [...adapters.values()];
  if (list.length === 0) {
    log.warn(
      'doctor: no sources configured. Set GMAIL_*, OUTLOOK_*, IMAP_*, WHATSAPP_BRIDGE_*, or IMESSAGE_BRIDGE_* in .env (see docs/CONNECTORS.md).',
    );
    return { rows: [], ok: true };
  }

  const { rows, ok } = await probeAdapters(list);
  for (const r of rows) {
    const mark = r.authValid ? 'OK  ' : r.connected ? 'AUTH' : 'DOWN';
    const tail = [r.detail, r.error].filter(Boolean).join(' — ');
    log.info(r, `doctor: [${mark}] ${r.source}${tail ? ` — ${tail}` : ''}`);
  }
  log.info(
    { ok, checked: rows.length },
    ok ? 'doctor: all configured sources healthy ✓' : 'doctor: some sources need attention — see rows above',
  );
  return { rows, ok };
}
