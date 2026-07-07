// =============================================================================
// CORTEX iMessage adapter (CORTEX side) — READ-ONLY. See services/imessage-bridge
// for the sidecar that owns the (local, macOS-only) chat.db read. This package
// ONLY reads from the bridge's GET /messages and GET /status. There is no send
// path anywhere in CORTEX, by design. The bridge runs on the operator's Mac
// (where ~/Library/Messages/chat.db lives) and exposes buffered *received*
// messages over a local, token-authed HTTP call — mirroring the WhatsApp bridge.
// =============================================================================

export interface IMessageBridgeMessage {
  seq: number; // monotonic cursor (chat.db ROWID)
  id: string; // message guid
  chatId: string; // chat/thread identifier (chat guid, or the handle for 1:1)
  handle: string; // the other party's phone number or Apple-ID email
  displayName: string; // resolved contact name if the bridge has one, else the handle
  timestamp: number; // epoch SECONDS (the bridge converts Apple's epoch)
  text: string;
  service: string; // 'iMessage' | 'SMS'
}

/** The seam — a fake implements this in tests; the real one calls the sidecar. */
export interface IMessageBridge {
  fetchMessages(since: number, limit?: number): Promise<IMessageBridgeMessage[]>;
  status(): Promise<{ connected: boolean; dbReadable: boolean; account?: string }>;
}

export function makeIMessageBridge(config: { url: string; token: string }): IMessageBridge {
  const headers = { authorization: `Bearer ${config.token}` };
  const base = config.url.replace(/\/$/, '');
  return {
    async fetchMessages(since, limit = 200) {
      const res = await fetch(`${base}/messages?since=${since}&limit=${limit}`, { headers });
      if (!res.ok) throw new Error(`imessage-bridge /messages -> ${res.status}`);
      const data = (await res.json()) as { messages?: IMessageBridgeMessage[] };
      return data.messages ?? [];
    },
    async status() {
      const res = await fetch(`${base}/status`, { headers });
      if (!res.ok) throw new Error(`imessage-bridge /status -> ${res.status}`);
      return (await res.json()) as { connected: boolean; dbReadable: boolean; account?: string };
    },
  };
}
