import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetEnvCache } from '@cortex/config';
import type { NormalizedItem, RawItem, SourceAdapter } from '@cortex/core';
import { PRIORITY_ROLLUP_SQL, clearTestDb, getDb, setTestDb } from '@cortex/db';
import * as dbSchema from '@cortex/db/schema';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock only the model call; keep the real payload builders / escalation logic.
vi.mock('@cortex/ai', async (importActual) => {
  const actual = await importActual<typeof import('@cortex/ai')>();
  return {
    ...actual,
    classifyTriage: vi.fn(async () => ({
      result: {
        category: 'action_required' as const,
        urgency: 3,
        requires_action: true,
        action_summary: 'Reply to Dana about the Q3 contract',
        deadline: null,
        confidence: 0.95,
      },
      model: 'test-haiku',
    })),
  };
});

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'packages',
  'db',
  'migrations',
);

function normalized(o: { id: string; bulk: boolean; sender: string }): NormalizedItem {
  return {
    source: 'gmail',
    sourceItemId: o.id,
    sourceThreadId: `t-${o.id}`,
    direction: 'inbound',
    sender: { displayName: o.sender, handle: `${o.sender}@x.com` },
    recipients: [],
    timestamp: new Date('2026-07-07T10:00:00Z'),
    subject: `subject ${o.id}`,
    bodyText: `body ${o.id}`,
    bodySnippet: `snippet ${o.id}`,
    hasAttachments: false,
    attachments: [],
    bulk: o.bulk,
    raw: {},
  };
}

class FakeAdapter implements SourceAdapter {
  readonly source = 'gmail' as const;
  #items: NormalizedItem[];
  constructor(items: NormalizedItem[]) {
    this.#items = items;
  }
  async fetchSince(): Promise<RawItem[]> {
    return this.#items.map((n) => ({ sourceItemId: n.sourceItemId, payload: n }));
  }
  normalize(raw: RawItem): NormalizedItem {
    return raw.payload as NormalizedItem;
  }
  async getCheckpoint() {
    return {};
  }
  async setCheckpoint() {}
  async status() {
    return { source: 'gmail' as const, connected: true, authValid: true };
  }
}

let client: PGlite;

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://test';
  process.env.CORTEX_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
  resetEnvCache();
  client = new PGlite();
  const db = drizzle(client, { schema: dbSchema });
  await migrate(db, { migrationsFolder });
  setTestDb(db);
});

afterAll(async () => {
  clearTestDb();
  await client.close();
});

describe('ingest → triage pipeline', () => {
  it('ingests, bulk-filters before the model, triages the rest, and populates Priority', async () => {
    const { registerAdapter } = await import('./registry');
    const { runIngest } = await import('./ingest');
    const { runTriage } = await import('./triage');

    registerAdapter(
      new FakeAdapter([
        normalized({ id: 'a', bulk: false, sender: 'dana' }),
        normalized({ id: 'b', bulk: true, sender: 'newsletter' }),
      ]),
    );

    const ingest = await runIngest();
    expect(ingest.ingested).toBe(2);
    expect(ingest.bulk).toBe(1); // the newsletter got a heuristic label, no model call

    const triage = await runTriage();
    expect(triage.triaged).toBe(1); // only the non-bulk item was sent to the (mocked) model

    // The triaged action item shows up in the Priority rollup at urgency 3.
    const res = await getDb().execute(PRIORITY_ROLLUP_SQL);
    expect(res.rows).toHaveLength(1);
    expect((res.rows[0] as { urgency: number }).urgency).toBe(3);
  });
});
