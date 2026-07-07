import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { describe, expect, it } from 'vitest';
import { PRIORITY_ROLLUP_SQL, mapPriorityRows } from './repo';
import * as schema from './schema';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

describe('priority rollup', () => {
  it('uses the latest pass per item and dedupes to the top item per thread', async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });

    const [entity] = await db
      .insert(schema.entities)
      .values({ displayName: 'Dana' })
      .returning({ id: schema.entities.id });
    const [thread] = await db
      .insert(schema.threads)
      .values({ source: 'gmail', sourceThreadId: 'T1', lastActivityAt: new Date() })
      .returning({ id: schema.threads.id });

    const mkItem = async (sourceItemId: string, threadId: string | null, ts: Date) => {
      const [row] = await db
        .insert(schema.items)
        .values({
          source: 'gmail',
          sourceItemId,
          direction: 'inbound',
          senderIdentity: entity!.id,
          threadId,
          timestamp: ts,
          subject: sourceItemId,
          raw: {},
        })
        .returning({ id: schema.items.id });
      return row!.id;
    };

    const A = await mkItem('A', null, new Date('2026-07-01'));
    const B = await mkItem('B', null, new Date('2026-07-02'));
    const C = await mkItem('C', thread!.id, new Date('2026-07-03'));
    const D = await mkItem('D', thread!.id, new Date('2026-07-04'));

    // E and F are urgency-3 but excluded by operator actions (done / snoozed).
    const [E] = await db
      .insert(schema.items)
      .values({ source: 'gmail', sourceItemId: 'E', direction: 'inbound', senderIdentity: entity!.id, timestamp: new Date('2026-07-05'), subject: 'E', raw: {}, doneAt: new Date() })
      .returning({ id: schema.items.id });
    const [F] = await db
      .insert(schema.items)
      .values({ source: 'gmail', sourceItemId: 'F', direction: 'inbound', senderIdentity: entity!.id, timestamp: new Date('2026-07-06'), subject: 'F', raw: {}, snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) })
      .returning({ id: schema.items.id });

    const cls = (itemId: string, urgency: number, createdAt: Date) =>
      db.insert(schema.classifications).values({
        itemId,
        model: 'x',
        category: 'action_required',
        urgency,
        requiresAction: true,
        actionSummary: `do ${itemId}`,
        confidence: 0.9,
        createdAt,
      });

    // A: newest pass is urgency 1 (older pass was 3) → excluded by latest-pass rule.
    await cls(A, 3, new Date('2026-07-01T10:00:00Z'));
    await cls(A, 1, new Date('2026-07-01T12:00:00Z'));
    // B: urgency 3, no thread → included.
    await cls(B, 3, new Date('2026-07-02T10:00:00Z'));
    // C & D share a thread at urgency 2 → dedupe to D (newer item timestamp).
    await cls(C, 2, new Date('2026-07-03T10:00:00Z'));
    await cls(D, 2, new Date('2026-07-04T10:00:00Z'));
    // E (done) and F (snoozed) are urgency 3 but must NOT appear.
    await cls(E!.id, 3, new Date('2026-07-05T10:00:00Z'));
    await cls(F!.id, 3, new Date('2026-07-06T10:00:00Z'));

    const res = await db.execute(PRIORITY_ROLLUP_SQL);
    const rows = mapPriorityRows(res.rows as Array<Record<string, unknown>>);

    expect(rows.map((r) => ({ subject: r.subject, urgency: r.urgency }))).toEqual([
      { subject: 'B', urgency: 3 },
      { subject: 'D', urgency: 2 },
    ]);

    await client.close();
  });
});
