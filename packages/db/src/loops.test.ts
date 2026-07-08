import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { describe, expect, it } from 'vitest';
import { CLOSE_LOOPS_SQL, OPEN_LOOPS_SQL } from './repo';
import * as schema from './schema';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

describe('open-loop reconciliation', () => {
  it('opens a loop for an inbound action item and closes it when the operator replies', async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });

    const reconcile = async () => {
      await db.execute(CLOSE_LOOPS_SQL);
      await db.execute(OPEN_LOOPS_SQL);
    };

    const [thread] = await db
      .insert(schema.threads)
      .values({ source: 'gmail', sourceThreadId: 'T1', lastActivityAt: new Date() })
      .returning({ id: schema.threads.id });

    // Inbound message that needs a reply.
    const [inbound] = await db
      .insert(schema.items)
      .values({
        source: 'gmail',
        sourceItemId: 'in-1',
        direction: 'inbound',
        threadId: thread!.id,
        timestamp: new Date('2026-07-07T09:00:00Z'),
        subject: 'Can you confirm the numbers?',
        raw: {},
      })
      .returning({ id: schema.items.id });
    await db.insert(schema.classifications).values({
      itemId: inbound!.id,
      model: 'x',
      category: 'action_required',
      urgency: 2,
      requiresAction: true,
      actionSummary: 'Confirm the numbers for Priya',
      confidence: 0.9,
    });

    await reconcile();
    let loops = await db.select().from(schema.openLoops);
    expect(loops).toHaveLength(1);
    expect(loops[0]!.type).toBe('awaiting_reply_from_operator');
    expect(loops[0]!.status).toBe('open');
    expect(loops[0]!.itemId).toBe(inbound!.id);

    // Operator replies (an outbound message later in the same thread).
    const [outbound] = await db
      .insert(schema.items)
      .values({
        source: 'gmail',
        sourceItemId: 'out-1',
        direction: 'outbound',
        threadId: thread!.id,
        timestamp: new Date('2026-07-07T11:00:00Z'),
        subject: 'Re: Can you confirm the numbers?',
        raw: {},
      })
      .returning({ id: schema.items.id });

    await reconcile();
    loops = await db.select().from(schema.openLoops).where(eq(schema.openLoops.id, loops[0]!.id));
    expect(loops[0]!.status).toBe('closed');
    expect(loops[0]!.resolvedByItemId).toBe(outbound!.id);

    // Idempotent: reconciling again neither reopens nor duplicates.
    await reconcile();
    const all = await db.select().from(schema.openLoops);
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe('closed');

    await client.close();
  });
});
