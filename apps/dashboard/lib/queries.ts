import 'server-only';
import {
  apiCalls,
  briefs,
  connectors,
  entities,
  getDb,
  items,
  mapPriorityRows,
  openLoops,
  PRIORITY_ROLLUP_SQL,
  type PriorityRow,
} from '@cortex/db';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { sourceDeepLink } from './deep-link';

export type { PriorityRow };

/**
 * "Open the real thing" URLs for a set of items, keyed by id. Kept as a separate
 * lookup so the (tested) priority rollup SQL stays untouched. Read-only — just
 * builds links to the source apps.
 */
export async function getDeepLinkMap(ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await getDb()
      .select({
        id: items.id,
        source: items.source,
        sourceItemId: items.sourceItemId,
        senderHandle: sql<string | null>`(${entities.handles} -> 0 ->> 'value')`,
        calendarUrl: sql<string | null>`(${items.raw} ->> 'htmlLink')`,
      })
      .from(items)
      .leftJoin(entities, eq(items.senderIdentity, entities.id))
      .where(inArray(items.id, ids));
    return new Map(rows.map((r) => [r.id, sourceDeepLink(r)]));
  } catch {
    return new Map();
  }
}

/**
 * Every query is wrapped so the dashboard renders cleanly even when the DB is
 * empty (Phase 0) or briefly unreachable. In Phase 0 all tables are empty, so
 * these return []/null — the views show their empty states.
 */

export async function getDbHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    await getDb().execute(sql`select 1`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getPriorityItems(): Promise<PriorityRow[]> {
  try {
    const res = await getDb().execute(PRIORITY_ROLLUP_SQL);
    return mapPriorityRows(res.rows as Array<Record<string, unknown>>);
  } catch {
    return [];
  }
}

export interface InboxRow {
  id: string;
  source: string;
  subject: string | null;
  senderName: string | null;
  timestamp: Date;
}

export async function getInboxItems(): Promise<InboxRow[]> {
  try {
    return await getDb()
      .select({
        id: items.id,
        source: items.source,
        subject: items.subject,
        senderName: entities.displayName,
        timestamp: items.timestamp,
      })
      .from(items)
      .leftJoin(entities, eq(items.senderIdentity, entities.id))
      .orderBy(desc(items.timestamp))
      .limit(100);
  } catch {
    return [];
  }
}

export async function getOpenLoops() {
  try {
    return await getDb()
      .select()
      .from(openLoops)
      .where(eq(openLoops.status, 'open'))
      .orderBy(desc(openLoops.dueAt))
      .limit(100);
  } catch {
    return [];
  }
}

export async function getLatestBrief() {
  try {
    const [row] = await getDb()
      .select()
      .from(briefs)
      .where(eq(briefs.kind, 'tomorrow_plan'))
      .orderBy(desc(briefs.createdAt))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

export async function getConnectors() {
  try {
    return await getDb().select().from(connectors);
  } catch {
    return [];
  }
}

/** Everything CORTEX sent to Anthropic about one item (Constraint §2/§10, §13). */
export async function getItemAudit(id: string) {
  try {
    const db = getDb();
    const [item] = await db
      .select({
        subject: items.subject,
        source: items.source,
        senderId: items.senderIdentity,
        senderName: entities.displayName,
        senderImportance: entities.importance,
      })
      .from(items)
      .leftJoin(entities, eq(items.senderIdentity, entities.id))
      .where(eq(items.id, id))
      .limit(1);
    if (!item) return null;
    const calls = await db
      .select({
        purpose: apiCalls.purpose,
        model: apiCalls.model,
        inputSummary: apiCalls.inputSummary,
        tokenUsage: apiCalls.tokenUsage,
        costEstimate: apiCalls.costEstimate,
        createdAt: apiCalls.createdAt,
      })
      .from(apiCalls)
      .where(eq(apiCalls.relatedItemId, id))
      .orderBy(desc(apiCalls.createdAt));
    return {
      subject: item.subject,
      source: item.source,
      senderId: item.senderId,
      senderName: item.senderName,
      senderImportance: item.senderImportance,
      calls,
    };
  } catch {
    return null;
  }
}

export async function getRecentApiCalls() {
  try {
    return await getDb()
      .select({
        id: apiCalls.id,
        purpose: apiCalls.purpose,
        model: apiCalls.model,
        createdAt: apiCalls.createdAt,
        relatedItemId: apiCalls.relatedItemId,
        tokenUsage: apiCalls.tokenUsage,
        costEstimate: apiCalls.costEstimate,
      })
      .from(apiCalls)
      .orderBy(desc(apiCalls.createdAt))
      .limit(50);
  } catch {
    return [];
  }
}
