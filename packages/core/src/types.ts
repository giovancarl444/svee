import type { Direction, SourceName } from './enums';

/** A participant handle as it appears on a message (jsonb payload). */
export interface Recipient {
  kind: 'from' | 'to' | 'cc' | 'bcc';
  handle: string; // email / phone / JID
  name?: string;
}

/** Attachment metadata only — the file itself lives in object storage, never in the row. */
export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size?: number;
  /** Key in object storage where the file was persisted (if downloaded). */
  storageKey?: string;
  /** Source-native reference to re-fetch (e.g. Gmail attachmentId). */
  sourceRef?: string;
}

/** One channel identifier that resolves to an entity (jsonb payload on `entities`). */
export interface EntityHandle {
  kind: 'email' | 'phone' | 'wa_jid' | 'other';
  value: string;
}

/**
 * The normalized unit every adapter must produce. Maps 1:1 onto a row in
 * `items` (the encrypted body columns are handled by the DB layer).
 */
export interface NormalizedItem {
  source: SourceName;
  sourceItemId: string;
  sourceThreadId?: string;
  direction: Direction;
  sender: { displayName: string; handle: string };
  recipients: Recipient[];
  timestamp: Date;
  subject?: string;
  bodyText?: string;
  bodySnippet?: string;
  hasAttachments: boolean;
  attachments: AttachmentMeta[];
  /** The untouched source payload, kept for reprocessing. */
  raw: unknown;
}

/** What `fetchSince` returns before normalization. */
export interface RawItem {
  sourceItemId: string;
  payload: unknown;
}

/**
 * Adapter-defined resume point. Shape is opaque to the core: Gmail stores a
 * `historyId`, IMAP a `{ uidValidity, lastUid }`, Calendar a `syncToken`.
 */
export type Checkpoint = Record<string, unknown>;

/** Health/auth snapshot for the Connectors dashboard view. */
export interface AdapterStatus {
  source: SourceName;
  connected: boolean;
  authValid: boolean;
  lastSyncAt?: Date;
  lastError?: string;
  detail?: string;
}
