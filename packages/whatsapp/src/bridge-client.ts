// =============================================================================
// CORTEX WhatsApp adapter (CORTEX side) — READ-ONLY. See services/whatsapp-bridge
// for the full rationale (spec §7). This package ONLY reads from the bridge's
// GET /messages and GET /status. There is no send path anywhere in CORTEX, by
// design. The bridge is the isolated, swappable, killable process that owns the
// (unofficial, ToS-violating, ban-risked) whatsmeow connection; this adapter just
// pulls the buffered incoming messages over a local, token-authed HTTP call.
// =============================================================================

export interface WABridgeMessage {
  seq: number;
  id: string;
  chatJid: string;
  senderJid: string;
  pushName: string;
  timestamp: number; // epoch seconds
  text: string;
}

/** The seam — a fake implements this in tests; the real one calls the sidecar. */
export interface WhatsAppBridge {
  fetchMessages(since: number, limit?: number): Promise<WABridgeMessage[]>;
  status(): Promise<{ connected: boolean; loggedIn: boolean; jid?: string }>;
}

export function makeWhatsAppBridge(config: { url: string; token: string }): WhatsAppBridge {
  const headers = { authorization: `Bearer ${config.token}` };
  const base = config.url.replace(/\/$/, '');
  return {
    async fetchMessages(since, limit = 200) {
      const res = await fetch(`${base}/messages?since=${since}&limit=${limit}`, { headers });
      if (!res.ok) throw new Error(`wa-bridge /messages -> ${res.status}`);
      const data = (await res.json()) as { messages?: WABridgeMessage[] };
      return data.messages ?? [];
    },
    async status() {
      const res = await fetch(`${base}/status`, { headers });
      if (!res.ok) throw new Error(`wa-bridge /status -> ${res.status}`);
      return (await res.json()) as { connected: boolean; loggedIn: boolean; jid?: string };
    },
  };
}
