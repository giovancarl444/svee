import {
  BRIEF_KINDS,
  CATEGORIES,
  DIRECTIONS,
  LOOP_STATUSES,
  LOOP_TYPES,
  SOURCES,
  type AttachmentMeta,
  type Checkpoint,
  type EntityHandle,
  type Recipient,
} from '@cortex/core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { encryptedText } from './encrypted';

// --- Enums (built from the single-source-of-truth tuples in @cortex/core) -----
export const sourceEnum = pgEnum('source', SOURCES);
export const directionEnum = pgEnum('direction', DIRECTIONS);
export const categoryEnum = pgEnum('category', CATEGORIES);
export const loopTypeEnum = pgEnum('loop_type', LOOP_TYPES);
export const loopStatusEnum = pgEnum('loop_status', LOOP_STATUSES);
export const briefKindEnum = pgEnum('brief_kind', BRIEF_KINDS);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();

// --- entities: people/orgs unified across channels ---------------------------
export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    displayName: text('display_name').notNull(),
    /** All channel identifiers (emails, phones, WA JIDs) pointing to one person. */
    handles: jsonb('handles').$type<EntityHandle[]>().notNull().default(sql`'[]'::jsonb`),
    /** 0 mute · 1 normal · 2 important · 3 VIP. Operator-set or learned. */
    importance: smallint('importance').notNull().default(1),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('entities_importance_idx').on(t.importance)],
);

// --- threads: conversation grouping within a source --------------------------
export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: sourceEnum('source').notNull(),
    sourceThreadId: text('source_thread_id').notNull(),
    title: text('title'),
    lastActivityAt: ts('last_activity_at'),
    participantCount: integer('participant_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('threads_source_thread_uq').on(t.source, t.sourceThreadId),
    index('threads_last_activity_idx').on(t.lastActivityAt),
  ],
);

// --- items: the universal normalized unit (one row per message/event/signal) --
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: sourceEnum('source').notNull(),
    /** Dedupe key, unique per source. */
    sourceItemId: text('source_item_id').notNull(),
    threadId: uuid('thread_id').references(() => threads.id, { onDelete: 'set null' }),
    direction: directionEnum('direction').notNull(),
    senderIdentity: uuid('sender_identity').references(() => entities.id, { onDelete: 'set null' }),
    recipients: jsonb('recipients').$type<Recipient[]>().notNull().default(sql`'[]'::jsonb`),
    timestamp: ts('timestamp').notNull(),
    subject: text('subject'),
    // Encrypted at rest (Constraint §5).
    bodyText: encryptedText('body_text'),
    bodySnippet: encryptedText('body_snippet'),
    hasAttachments: boolean('has_attachments').notNull().default(false),
    attachments: jsonb('attachments').$type<AttachmentMeta[]>().notNull().default(sql`'[]'::jsonb`),
    /** Untouched source payload, for reprocessing. */
    raw: jsonb('raw').$type<unknown>().notNull(),
    ingestedAt: ts('ingested_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('items_source_item_uq').on(t.source, t.sourceItemId),
    index('items_timestamp_idx').on(t.timestamp),
    index('items_thread_idx').on(t.threadId),
    index('items_sender_idx').on(t.senderIdentity),
  ],
);

// --- classifications: one row per (item, model-pass) — APPEND ONLY ------------
export const classifications = pgTable(
  'classifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    category: categoryEnum('category').notNull(),
    urgency: smallint('urgency').notNull(),
    requiresAction: boolean('requires_action').notNull(),
    actionSummary: text('action_summary').notNull().default(''),
    deadlineAt: ts('deadline_at'),
    confidence: real('confidence').notNull(),
    reasoning: text('reasoning').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [
    index('classifications_item_idx').on(t.itemId),
    index('classifications_category_idx').on(t.category),
  ],
);

// --- open_loops: things awaiting a response / a pending commitment -----------
export const openLoops = pgTable(
  'open_loops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    type: loopTypeEnum('type').notNull(),
    description: text('description').notNull(),
    dueAt: ts('due_at'),
    status: loopStatusEnum('status').notNull().default('open'),
    /** The later item that satisfied this loop, closing it. */
    resolvedByItemId: uuid('resolved_by_item_id').references(() => items.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('open_loops_status_idx').on(t.status),
    index('open_loops_due_idx').on(t.dueAt),
    index('open_loops_item_idx').on(t.itemId),
  ],
);

// --- briefs: generated digests (the Tomorrow Plan) ---------------------------
export const briefs = pgTable(
  'briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: briefKindEnum('kind').notNull(),
    forDate: date('for_date', { mode: 'string' }).notNull(),
    contentMd: text('content_md').notNull(),
    itemsConsidered: jsonb('items_considered').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    model: text('model').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('briefs_for_date_idx').on(t.forDate)],
);

// --- api_calls: audit of every Claude call ("what left the box", Constraint §2/§10)
export const apiCalls = pgTable(
  'api_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purpose: text('purpose').notNull(),
    model: text('model').notNull(),
    /** The item this call was about, so "what did CORTEX send about item X?" is answerable. */
    relatedItemId: uuid('related_item_id').references(() => items.id, { onDelete: 'set null' }),
    /** The EXACT payload that left the box (post-redaction allowlist). */
    inputSummary: jsonb('input_summary').$type<unknown>().notNull(),
    tokenUsage: jsonb('token_usage').$type<{ input?: number; output?: number } | null>(),
    costEstimate: numeric('cost_estimate', { precision: 12, scale: 6 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('api_calls_related_item_idx').on(t.relatedItemId),
    index('api_calls_created_idx').on(t.createdAt),
  ],
);

// --- connectors: per-adapter checkpoint + health (SourceAdapter state, §5/§9) -
export const connectors = pgTable('connectors', {
  source: sourceEnum('source').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  /** Adapter-defined resume point (historyId / uid / syncToken). */
  checkpoint: jsonb('checkpoint').$type<Checkpoint>().notNull().default(sql`'{}'::jsonb`),
  /** Last AdapterStatus snapshot for the Connectors view. */
  status: jsonb('status').$type<unknown>(),
  lastSyncAt: ts('last_sync_at'),
  lastError: text('last_error'),
  updatedAt: updatedAt(),
});

// --- Inferred row types (handy across the app) -------------------------------
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Thread = typeof threads.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type Classification = typeof classifications.$inferSelect;
export type NewClassification = typeof classifications.$inferInsert;
export type OpenLoop = typeof openLoops.$inferSelect;
export type Brief = typeof briefs.$inferSelect;
export type ApiCall = typeof apiCalls.$inferSelect;
export type Connector = typeof connectors.$inferSelect;
