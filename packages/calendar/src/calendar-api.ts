import { getEnv } from '@cortex/config';
import { google, type calendar_v3 } from 'googleapis';

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

/** Narrow, mockable facade over the Calendar events.list endpoint. */
export interface CalendarApi {
  listFull(params: { timeMin: string; timeMax: string; pageToken?: string }): Promise<calendar_v3.Schema$Events>;
  listIncremental(params: { syncToken: string; pageToken?: string }): Promise<calendar_v3.Schema$Events>;
}

/**
 * Reuse the shared Google OAuth creds (the GMAIL_* env vars) + refresh token.
 * Run `pnpm gmail:auth` with the calendar scope included to grant read access.
 */
export function authedCalendarClient(refreshToken: string): OAuth2Client {
  const env = getEnv();
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REDIRECT_URI) {
    throw new Error('Google OAuth is not configured (GMAIL_CLIENT_ID/SECRET/REDIRECT_URI).');
  }
  const client = new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET, env.GMAIL_REDIRECT_URI);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export function makeCalendarApi(auth: OAuth2Client, calendarId: string): CalendarApi {
  const cal = google.calendar({ version: 'v3', auth });
  return {
    async listFull(p) {
      return (
        await cal.events.list({
          calendarId,
          timeMin: p.timeMin,
          timeMax: p.timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500,
          pageToken: p.pageToken,
        })
      ).data;
    },
    async listIncremental(p) {
      // syncToken is mutually exclusive with time/order filters; singleEvents must
      // match the originating full sync.
      return (
        await cal.events.list({
          calendarId,
          syncToken: p.syncToken,
          singleEvents: true,
          maxResults: 2500,
          pageToken: p.pageToken,
        })
      ).data;
    },
  };
}

/** A 410 GONE on an incremental call means the syncToken expired → full resync. */
export function isGone(err: unknown): boolean {
  const e = err as { code?: number; status?: number; response?: { status?: number } };
  return e?.code === 410 || e?.status === 410 || e?.response?.status === 410;
}
