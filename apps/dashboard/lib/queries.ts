import 'server-only';
import {
  apiCalls,
  briefs,
  classifications,
  connectors,
  entities,
  getDb,
  items,
  openLoops,
} from '@cortex/db';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

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

export interface PriorityRow {
  id: string;
  source: string;
  subject: string | null;
  senderName: string | null;
  urgency: number;
  actionSummary: string;
  timestamp: Date;
}

export async function getPriorityItems(): Promise<PriorityRow[]> {
  try {
    // TODO(Phase 1): roll up to a thread verdict and use only the latest pass.
    const rows = await getDb()
      .select({
        id: items.id,
        source: items.source,
        subject: items.subject,
        senderName: entities.displayName,
        urgency: classifications.urgency,
        actionSummary: classifications.actionSummary,
        timestamp: items.timestamp,
      })
      .from(items)
      .innerJoin(classifications, eq(classifications.itemId, items.id))
      .leftJoin(entities, eq(items.senderIdentity, entities.id))
      .where(and(gte(classifications.urgency, 2), eq(classifications.requiresAction, true)))
      .orderBy(desc(classifications.urgency), desc(items.timestamp))
      .limit(50);
    return rows;
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
