import { getEnv } from '@cortex/config';
import { CalendarAdapter, authedCalendarClient, makeCalendarApi } from '@cortex/calendar';
import { dbCheckpointStore } from '@cortex/db';
import { GmailAdapter, authedClient, makeGmailApi } from '@cortex/gmail';
import { ImapAdapter, makeImapFetcher } from '@cortex/imap';
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

  if (env.IMAP_HOST && env.IMAP_USER && env.IMAP_PASSWORD) {
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
}
