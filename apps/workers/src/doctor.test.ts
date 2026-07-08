import type { AdapterStatus, NormalizedItem, RawItem, SourceAdapter, SourceName } from '@cortex/core';
import { describe, expect, it } from 'vitest';
import { probeAdapters } from './doctor';

/** A fake adapter whose only interesting behavior is what status() does. */
function fake(source: SourceName, status: () => Promise<AdapterStatus>): SourceAdapter {
  return {
    source,
    status,
    async fetchSince(): Promise<RawItem[]> {
      return [];
    },
    normalize(raw: RawItem): NormalizedItem {
      return raw.payload as NormalizedItem;
    },
    async getCheckpoint() {
      return {};
    },
    async setCheckpoint() {},
  };
}

describe('probeAdapters', () => {
  it('reports each source read-only and is ok only when all auth-valid', async () => {
    const healthy = fake('gmail', async () => ({
      source: 'gmail',
      connected: true,
      authValid: true,
      detail: 'me@x.com',
    }));
    const badAuth = fake('imap', async () => ({
      source: 'imap',
      connected: true,
      authValid: false,
      lastError: 'AUTHENTICATIONFAILED',
    }));

    const { rows, ok } = await probeAdapters([healthy, badAuth]);
    expect(ok).toBe(false);
    expect(rows).toEqual([
      { source: 'gmail', connected: true, authValid: true, detail: 'me@x.com' },
      { source: 'imap', connected: true, authValid: false, error: 'AUTHENTICATIONFAILED' },
    ]);
  });

  it('captures a thrown status() as an unhealthy row instead of aborting the sweep', async () => {
    const throws = fake('whatsapp', async () => {
      throw new Error('bridge unreachable');
    });
    const healthy = fake('calendar', async () => ({ source: 'calendar', connected: true, authValid: true }));

    const { rows, ok } = await probeAdapters([throws, healthy]);
    expect(ok).toBe(false);
    expect(rows[0]).toEqual({ source: 'whatsapp', connected: false, authValid: false, error: 'bridge unreachable' });
    expect(rows[1]).toMatchObject({ source: 'calendar', authValid: true });
  });

  it('is ok with an empty list (nothing configured is not a failure)', async () => {
    expect(await probeAdapters([])).toEqual({ rows: [], ok: true });
  });
});
