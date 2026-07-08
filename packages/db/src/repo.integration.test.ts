import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetEnvCache } from '@cortex/config';
import type { NormalizedItem } from '@cortex/core';
import { PGlite } from '@electric-sql/pglite';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearTestDb, setTestDb } from './client';
import { resetKeyCache } from './crypto';
import {
  classifyBulkHeuristic,
  findOrCreateEntityByHandle,
  getItemsNeedingTriage,
  markItemDone,
  mergeEntities,
  upsertItem,
} from './repo';
import * as schema from './schema';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

function item(o: {
  sourceItemId: string;
  senderHandle?: string;
  senderName?: string;
  subject?: string;
  bodyText?: string;
  bodySnippet?: string;
  sourceThreadId?: string;
  bulk?: boolean;
}): NormalizedItem {
  return {
    source: 'gmail',
    sourceItemId: o.sourceItemId,
    ...(o.sourceThreadId ? { sourceThreadId: o.sourceThreadId } : {}),
    direction: 'inbound',
    sender: { displayName: o.senderName ?? 'unknown', handle: o.senderHandle ?? 'x@x.com' },
    recipients: [],
    timestamp: new Date('2026-07-07T10:00:00Z'),
    ...(o.subject ? { subject: o.subject } : {}),
    ...(o.bodyText ? { bodyText: o.bodyText } : {}),
    bodySnippet: o.bodySnippet ?? 'snip',
    hasAttachments: false,
    attachments: [],
    bulk: o.bulk ?? false,
    raw: {},
  };
}

let client: PGlite;

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://test';
  process.env.CORTEX_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  resetEnvCache();
  resetKeyCache();
  client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  setTestDb(db);
});

afterAll(async () => {
  clearTestDb();
  await client.close();
});

describe('repo layer (real functions on Postgres/PGlite)', () => {
  it('resolves entities/threads, dedupes, encrypts bodies, learns importance, merges', async () => {
    const db = drizzle(client, { schema });

    // upsert creates entity + thread + item
    const r1 = await upsertItem(
      item({ sourceItemId: 'm1', senderHandle: 'dana@acme.com', senderName: 'Dana', subject: 'Q3', bodyText: 'secret body', bodySnippet: 'the snippet', sourceThreadId: 't1' }),
    );
    expect(r1.isNew).toBe(true);
    expect(r1.itemId).toBeTruthy();

    // dedupe on (source, source_item_id)
    const dup = await upsertItem(item({ sourceItemId: 'm1', senderHandle: 'dana@acme.com' }));
    expect(dup.isNew).toBe(false);

    // exactly one entity + one thread
    expect((await db.select().from(schema.entities)).length).toBe(1);
    expect((await db.select().from(schema.threads)).length).toBe(1);

    // body encrypted at rest (raw column is the ciphertext envelope)
    const rawBody = await db.execute(sql`select left(body_text, 3) as h from items where source_item_id = 'm1'`);
    expect((rawBody.rows[0] as { h: string }).h).toBe('v1:');

    // getItemsNeedingTriage decrypts the snippet + carries sender info
    const cands = await getItemsNeedingTriage();
    expect(cands).toHaveLength(1);
    expect(cands[0]!.snippet).toBe('the snippet');
    expect(cands[0]!.senderName).toBe('Dana');
    expect(cands[0]!.senderImportance).toBe(1);

    // a bulk item gets a heuristic classification and drops out of the triage queue
    const bulk = await upsertItem(item({ sourceItemId: 'm2', senderHandle: 'news@x.com', bulk: true }));
    await classifyBulkHeuristic(bulk.itemId!);
    const afterBulk = await getItemsNeedingTriage();
    expect(afterBulk.map((c) => c.id)).not.toContain(bulk.itemId);

    // importance learning: marking m1 done bumps Dana 1 → 2
    await markItemDone(r1.itemId!);
    const [dana] = await db.select().from(schema.entities).where(eq(schema.entities.displayName, 'Dana'));
    expect(dana!.importance).toBe(2);

    // cross-kind merge: a WhatsApp identity folds into Dana
    const waId = await findOrCreateEntityByHandle('15551234@s.whatsapp.net', 'Dana W', 'wa_jid');
    await mergeEntities(dana!.id, waId!);
    // Dana (now with 2 handles) + the bulk sender 'news@x.com' remain; Dana-W is gone.
    const remaining = await db.select().from(schema.entities);
    expect(remaining).toHaveLength(2);
    const merged = remaining.find((e) => e.displayName === 'Dana')!;
    expect(merged.handles.map((h) => h.kind).sort()).toEqual(['email', 'wa_jid']);
  });
});
