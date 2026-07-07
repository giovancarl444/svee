import type { SourceAdapter, SourceName } from '@cortex/core';

/**
 * The adapter registry. Phase 1+ adapters (Gmail, IMAP, Calendar, WhatsApp)
 * register themselves here; the ingestion loop iterates this map. Empty in the
 * Phase 0 skeleton — adding a source later is one `registerAdapter` call.
 */
export const adapters = new Map<SourceName, SourceAdapter>();

export function registerAdapter(adapter: SourceAdapter): void {
  adapters.set(adapter.source, adapter);
}
