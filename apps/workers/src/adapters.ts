import { getEnv } from '@cortex/config';
import { CalendarAdapter, authedCalendarClient, makeCalendarApi } from '@cortex/calendar';
import { dbCheckpointStore } from '@cortex/db';
import { GmailAdapter, authedClient, makeGmailApi } from '@cortex/gmail';
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
}
