/**
 * The controlled vocabularies of CORTEX, defined ONCE here as `as const` tuples.
 * `@cortex/db` builds its `pgEnum`s from these exact arrays, so the Postgres
 * enums and the TypeScript unions can never drift apart.
 */

export const SOURCES = ['gmail', 'imap', 'whatsapp', 'calendar', 'imessage'] as const;
export type SourceName = (typeof SOURCES)[number];

export const DIRECTIONS = ['inbound', 'outbound', 'system'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Tier-1/2 triage categories (spec §8). */
export const CATEGORIES = [
  'action_required',
  'awaiting_reply',
  'fyi',
  'scheduling',
  'financial',
  'personal',
  'newsletter_promo',
  'spam_noise',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Urgency: 0 ignore · 1 whenever · 2 today/tomorrow · 3 now. */
export type Urgency = 0 | 1 | 2 | 3;

export const LOOP_TYPES = [
  'awaiting_reply_from_operator',
  'awaiting_reply_from_them',
  'commitment_made',
  'deadline_pending',
] as const;
export type LoopType = (typeof LOOP_TYPES)[number];

export const LOOP_STATUSES = ['open', 'closed', 'snoozed'] as const;
export type LoopStatus = (typeof LOOP_STATUSES)[number];

export const BRIEF_KINDS = ['tomorrow_plan', 'morning', 'on_demand'] as const;
export type BriefKind = (typeof BRIEF_KINDS)[number];
