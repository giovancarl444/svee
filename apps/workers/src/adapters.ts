import { getEnv } from '@cortex/config';
import { CalendarAdapter, authedCalendarClient, makeCalendarApi } from '@cortex/calendar';
import { dbCheckpointStore } from '@cortex/db';
import { GmailAdapter, authedClient, makeGmailApi } from '@cortex/gmail';
import {
  ImapAdapter,
  OUTLOOK_IMAP_HOST,
  OUTLOOK_IMAP_PORT,
  makeImapFetcher,
  makeMicrosoftTokenProvider,
} from '@cortex/imap';
import { IMessageAdapter, makeIMessageBridge } from '@cortex/imessage';
import { WhatsAppAdapter, makeWhatsAppBridge } from '@cortex/whatsapp';
import { log } from './logger';
import { registerAdapter } from './registry';

/**
 * Build and register the adapters that are actually configured in env. A source
 * missing its credentials is simply skipped — never a hard failure. IMAP and
 * WhatsApp register here in later phases.
 */
export function wireAdapters(): void {
  const env = getEnv();
  const googleReady =
    env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REDIRECT_URI && env.GMAIL_REFRESH_TOKEN;

  if (googleReady) {
    const api = makeGmailApi(authedClient(env.GMAIL_REFRESH_TOKEN!));
    registerAdapter(new GmailAdapter({ api, store: dbCheckpointStore }));
    log.info('adapters: gmail registered');

    // Calendar reuses the same Google refresh token (consented with the calendar scope).
    const calApi = makeCalendarApi(authedCalendarClient(env.GMAIL_REFRESH_TOKEN!), env.GOOGLE_CALENDAR_ID);
    registerAdapter(new CalendarAdapter({ api: calApi, store: dbCheckpointStore }));
    log.info({ calendarId: env.GOOGLE_CALENDAR_ID }, 'adapters: calendar registered');
  } else {
    log.warn('adapters: google not configured (GMAIL_CLIENT_ID/SECRET/REDIRECT_URI/REFRESH_TOKEN) — skipping gmail + calendar');
  }

  // The single non-Gmail IMAP slot. Prefer Outlook-over-OAuth when configured
  // (basic auth no longer works for Outlook); else a generic password mailbox.
  if (env.OUTLOOK_CLIENT_ID && env.OUTLOOK_REFRESH_TOKEN && env.OUTLOOK_USER) {
    const getToken = makeMicrosoftTokenProvider({
      clientId: env.OUTLOOK_CLIENT_ID,
      ...(env.OUTLOOK_CLIENT_SECRET ? { clientSecret: env.OUTLOOK_CLIENT_SECRET } : {}),
      refreshToken: env.OUTLOOK_REFRESH_TOKEN,
      tenant: env.OUTLOOK_TENANT,
    });
    const fetcher = makeImapFetcher({
      host: OUTLOOK_IMAP_HOST,
      port: OUTLOOK_IMAP_PORT,
      user: env.OUTLOOK_USER,
      accessToken: getToken,
    });
    registerAdapter(new ImapAdapter({ fetcher, store: dbCheckpointStore }));
    log.info({ user: env.OUTLOOK_USER }, 'adapters: outlook registered (IMAP over OAuth, read-only)');
    if (env.IMAP_HOST) {
      log.warn('adapters: both OUTLOOK_* and IMAP_* set — using Outlook for the IMAP slot, ignoring IMAP_*');
    }
  } else if (env.IMAP_HOST && env.IMAP_USER && env.IMAP_PASSWORD) {
    const fetcher = makeImapFetcher({
      host: env.IMAP_HOST,
      port: env.IMAP_PORT,
      user: env.IMAP_USER,
      pass: env.IMAP_PASSWORD,
    });
    registerAdapter(new ImapAdapter({ fetcher, store: dbCheckpointStore }));
    log.info({ host: env.IMAP_HOST }, 'adapters: imap registered');
  }

  // WhatsApp: read-only, via the isolated whatsmeow bridge (spec §7).
  if (env.WHATSAPP_BRIDGE_URL && env.WHATSAPP_BRIDGE_TOKEN) {
    const bridge = makeWhatsAppBridge({ url: env.WHATSAPP_BRIDGE_URL, token: env.WHATSAPP_BRIDGE_TOKEN });
    registerAdapter(new WhatsAppAdapter({ bridge, store: dbCheckpointStore }));
    log.info({ bridge: env.WHATSAPP_BRIDGE_URL }, 'adapters: whatsapp registered (read-only)');
  }

  // iMessage: read-only, via the macOS chat.db sidecar (runs on the operator's Mac).
  if (env.IMESSAGE_BRIDGE_URL && env.IMESSAGE_BRIDGE_TOKEN) {
    const bridge = makeIMessageBridge({ url: env.IMESSAGE_BRIDGE_URL, token: env.IMESSAGE_BRIDGE_TOKEN });
    registerAdapter(new IMessageAdapter({ bridge, store: dbCheckpointStore }));
    log.info({ bridge: env.IMESSAGE_BRIDGE_URL }, 'adapters: imessage registered (read-only)');
  }
}
