import type { BriefKind, Category, NormalizedItem, SourceName } from '@cortex/core';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { getDb } from './client';
import { briefs, classifications, entities, items, openLoops, threads } from './schema';

/** Find or create a thread by (source, sourceThreadId); refresh its activity. */
export async function findOrCreateThread(
  source: SourceName,
  sourceThreadId: string | undefined,
  title: string | undefined,
  lastActivityAt: Date,
): Promise<string | null> {
  if (!sourceThreadId) return null;
  const db = getDb();
  const [existing] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.source, source), eq(threads.sourceThreadId, sourceThreadId)))
    .limit(1);
  if (existing) {
    await db
      .update(threads)
      .set({ lastActivityAt, ...(title ? { title } : {}) })
      .where(eq(threads.id, existing.id));
    return existing.id;
  }
  const [ins] = await db
    .insert(threads)
    .values({ source, sourceThreadId, ...(title ? { title } : {}), lastActivityAt })
    .onConflictDoNothing()
    .returning({ id: threads.id });
  if (ins) return ins.id;
  const [again] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.source, source), eq(threads.sourceThreadId, sourceThreadId)))
    .limit(1);
  return again?.id ?? null;
}

/** Resolve a person by any channel handle, creating a minimal entity if unseen. */
export async function findOrCreateEntityByHandle(
  handle: string,
  displayName: string,
): Promise<string | null> {
  if (!handle) return null;
  const db = getDb();
  const probe = JSON.stringify([{ kind: 'email', value: handle }]);
  const [found] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(sql`${entities.handles} @> ${probe}::jsonb`)
    .limit(1);
  if (found) return found.id;
  const [ins] = await db
    .insert(entities)
    .values({ displayName: displayName || handle, handles: [{ kind: 'email', value: handle }] })
    .returning({ id: entities.id });
  return ins?.id ?? null;
}

export interface UpsertResult {
  itemId: string | null;
  isNew: boolean;
}

/** Insert one normalized item, deduped on (source, source_item_id). */
export async function upsertItem(n: NormalizedItem): Promise<UpsertResult> {
  const db = getDb();
  const threadId = await findOrCreateThread(n.source, n.sourceThreadId, n.subject, n.timestamp);
  const senderIdentity = n.sender.handle
    ? await findOrCreateEntityByHandle(n.sender.handle, n.sender.displayName)
    : null;

  const [ins] = await db
    .insert(items)
    .values({
      source: n.source,
      sourceItemId: n.sourceItemId,
      threadId,
      direction: n.direction,
      senderIdentity,
      recipients: n.recipients,
      timestamp: n.timestamp,
      ...(n.subject ? { subject: n.subject } : {}),
      ...(n.bodyText ? { bodyText: n.bodyText } : {}),
      ...(n.bodySnippet ? { bodySnippet: n.bodySnippet } : {}),
      hasAttachments: n.hasAttachments,
      attachments: n.attachments,
      raw: n.raw,
    })
    .onConflictDoNothing({ target: [items.source, items.sourceItemId] })
    .returning({ id: items.id });

  return ins ? { itemId: ins.id, isNew: true } : { itemId: null, isNew: false };
}

/** Cheap heuristic classification for bulk mail — no model call (spec §6). */
export async function classifyBulkHeuristic(itemId: string): Promise<void> {
  await getDb().insert(classifications).values({
    itemId,
    model: 'heuristic',
    category: 'newsletter_promo',
    urgency: 0,
    requiresAction: false,
    actionSummary: '',
    confidence: 1,
    reasoning: 'bulk/automated by header heuristic',
  });
}

export interface TriageCandidate {
  id: string;
  source: SourceName;
  subject: string | null;
  snippet: string | null;
  timestamp: Date;
  senderName: string | null;
  senderImportance: number;
}

/** Items with no classification pass yet, newest first. */
export async function getItemsNeedingTriage(limit = 100): Promise<TriageCandidate[]> {
  const db = getDb();
  return db
    .select({
      id: items.id,
      source: items.source,
      subject: items.subject,
      snippet: items.bodySnippet, // auto-decrypted by the column type
      timestamp: items.timestamp,
      senderName: entities.displayName,
      senderImportance: entities.importance,
    })
    .from(items)
    .leftJoin(entities, eq(items.senderIdentity, entities.id))
    .where(sql`not exists (select 1 from ${classifications} c where c.item_id = ${items.id})`)
    .orderBy(desc(items.timestamp))
    .limit(limit) as unknown as Promise<TriageCandidate[]>;
}

export interface ClassificationInput {
  itemId: string;
  model: string;
  category: Category;
  urgency: number;
  requiresAction: boolean;
  actionSummary: string;
  deadlineAt?: Date | null;
  confidence: number;
  reasoning: string;
}

/**
 * The Priority view query (spec §6): take only the LATEST classification pass per
 * item, keep the urgency-2/3 action items, then roll up to one row per thread
 * (highest-urgency item wins). Items with no thread stand alone. Exported as a
 * single source so the dashboard and tests run the exact same SQL.
 */
export const PRIORITY_ROLLUP_SQL: SQL = sql`
  with latest as (
    select distinct on (c.item_id)
      c.item_id, c.urgency, c.requires_action, c.action_summary
    from classifications c
    order by c.item_id, c.created_at desc
  ),
  ranked as (
    select
      i.id, i.source, i.subject, i.timestamp,
      e.display_name as sender_name,
      l.urgency, l.action_summary,
      coalesce(i.thread_id::text, i.id::text) as thread_key
    from items i
    join latest l on l.item_id = i.id
    left join entities e on e.id = i.sender_identity
    where l.requires_action = true and l.urgency >= 2
  ),
  per_thread as (
    select distinct on (thread_key) *
    from ranked
    order by thread_key, urgency desc, timestamp desc
  )
  select id, source, subject, sender_name, urgency, action_summary, timestamp
  from per_thread
  order by urgency desc, timestamp desc
  limit 50
`;

export interface PriorityRow {
  id: string;
  source: string;
  subject: string | null;
  senderName: string | null;
  urgency: number;
  actionSummary: string;
  timestamp: Date;
}

export function mapPriorityRows(rows: Array<Record<string, unknown>>): PriorityRow[] {
  return rows.map((r) => ({
    id: String(r.id),
    source: String(r.source),
    subject: (r.subject as string | null) ?? null,
    senderName: (r.sender_name as string | null) ?? null,
    urgency: Number(r.urgency),
    actionSummary: String(r.action_summary ?? ''),
    timestamp: r.timestamp instanceof Date ? r.timestamp : new Date(String(r.timestamp)),
  }));
}

export async function insertClassification(c: ClassificationInput): Promise<void> {
  await getDb()
    .insert(classifications)
    .values({
      itemId: c.itemId,
      model: c.model,
      category: c.category,
      urgency: c.urgency,
      requiresAction: c.requiresAction,
      actionSummary: c.actionSummary,
      ...(c.deadlineAt ? { deadlineAt: c.deadlineAt } : {}),
      confidence: c.confidence,
      reasoning: c.reasoning,
    });
}

// --- Open-loop reconciliation (spec §8: "nothing falls through") -------------
//
// Idempotent, state-based (no "processed" flag). An inbound item that needs a
// reply opens an `awaiting_reply_from_operator` loop for its thread; the loop
// closes when a later OUTBOUND item (the operator's reply) appears in that
// thread. Enum literals are unknown-typed and cast to the column enums by PG.

export const OPEN_LOOPS_SQL: SQL = sql`
  insert into open_loops (item_id, type, description, due_at, status)
  select
    i.id,
    'awaiting_reply_from_operator',
    coalesce(nullif(l.action_summary, ''), i.subject, 'Reply needed'),
    l.deadline_at,
    'open'
  from items i
  join lateral (
    select c.requires_action, c.category, c.action_summary, c.deadline_at
    from classifications c where c.item_id = i.id order by c.created_at desc limit 1
  ) l on true
  where i.direction = 'inbound'
    and (l.requires_action = true or l.category = 'awaiting_reply')
    and not exists (
      select 1 from open_loops ol join items oi on oi.id = ol.item_id
      where ol.status = 'open' and ol.type = 'awaiting_reply_from_operator'
        and coalesce(oi.thread_id, oi.id) = coalesce(i.thread_id, i.id)
    )
    and not exists (
      select 1 from items o
      where o.direction = 'outbound'
        and coalesce(o.thread_id, o.id) = coalesce(i.thread_id, i.id)
        and o.timestamp > i.timestamp
    )
`;

export const CLOSE_LOOPS_SQL: SQL = sql`
  update open_loops ol
  set status = 'closed', resolved_by_item_id = sub.out_id, updated_at = now()
  from (
    select ol2.id as loop_id, o.out_id
    from open_loops ol2
    join items i on i.id = ol2.item_id
    join lateral (
      select o2.id as out_id from items o2
      where o2.direction = 'outbound'
        and coalesce(o2.thread_id, o2.id) = coalesce(i.thread_id, i.id)
        and o2.timestamp > i.timestamp
      order by o2.timestamp asc limit 1
    ) o on true
    where ol2.status = 'open' and ol2.type = 'awaiting_reply_from_operator'
  ) sub
  where ol.id = sub.loop_id
`;

/** Close satisfied loops, then open new ones. Idempotent; safe to run each sync. */
export async function reconcileLoops(): Promise<void> {
  const db = getDb();
  await db.execute(CLOSE_LOOPS_SQL);
  await db.execute(OPEN_LOOPS_SQL);
}

// --- Nightly synthesis inputs ------------------------------------------------
export interface SynthesisActionRow {
  id: string;
  source: string;
  senderName: string | null;
  actionSummary: string;
  urgency: number;
  deadlineAt: Date | null;
}

/** The day's action_required / awaiting_reply items (latest pass), for the brief. */
export async function getSynthesisActions(limit = 40): Promise<SynthesisActionRow[]> {
  const res = await getDb().execute(sql`
    with latest as (
      select distinct on (c.item_id)
        c.item_id, c.category, c.urgency, c.requires_action, c.action_summary, c.deadline_at
      from classifications c order by c.item_id, c.created_at desc
    )
    select i.id, i.source, e.display_name as sender_name,
           l.action_summary, l.urgency, l.deadline_at
    from items i
    join latest l on l.item_id = i.id
    left join entities e on e.id = i.sender_identity
    where l.requires_action = true or l.category in ('action_required', 'awaiting_reply')
    order by l.urgency desc, i.timestamp desc
    limit ${limit}
  `);
  return (res.rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    source: String(r.source),
    senderName: (r.sender_name as string | null) ?? null,
    actionSummary: String(r.action_summary ?? ''),
    urgency: Number(r.urgency),
    deadlineAt: r.deadline_at ? new Date(String(r.deadline_at)) : null,
  }));
}

export interface OpenLoopSummary {
  type: string;
  description: string;
  dueAt: Date | null;
}

export async function getOpenLoopSummaries(limit = 50): Promise<OpenLoopSummary[]> {
  const rows = await getDb()
    .select({ type: openLoops.type, description: openLoops.description, dueAt: openLoops.dueAt })
    .from(openLoops)
    .where(eq(openLoops.status, 'open'))
    .orderBy(desc(openLoops.dueAt))
    .limit(limit);
  return rows.map((r) => ({ type: r.type, description: r.description, dueAt: r.dueAt ?? null }));
}

export async function insertBrief(b: {
  kind: BriefKind;
  forDate: string;
  contentMd: string;
  itemsConsidered: string[];
  model: string;
}): Promise<string> {
  const [row] = await getDb()
    .insert(briefs)
    .values({
      kind: b.kind,
      forDate: b.forDate,
      contentMd: b.contentMd,
      itemsConsidered: b.itemsConsidered,
      model: b.model,
    })
    .returning({ id: briefs.id });
  return row!.id;
}
