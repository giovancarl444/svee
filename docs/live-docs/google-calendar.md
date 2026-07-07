# Google Calendar

_Surface:_ Google Calendar API v3 (REST) for read-only event ingestion, accessed via the official `googleapis` Node/TS client, with CalDAV (RFC 4791 + RFC 6578) as the fallback for non-Google calendars (iCloud, Fastmail, self-hosted). Scope of this research: OAuth read-only scope, events.list windowing + recurring expansion, incremental sync via syncToken with 410 GONE recovery, all-day vs timed/timezone normalization, and the CalDAV analog. This maps directly to CORTEX's Phase-3 Google Calendar adapter (GOOGLE_CALENDAR_ID=primary, reuses the Gmail OAuth client) feeding the nightly Tomorrow Plan.

## Current version
googleapis npm 173.0.0 (pulls google-auth-library ^10.2.0 — latest 10.9.0 — and googleapis-common ^8.0.0). Underlying REST is Google Calendar API v3 (data model rev ~v3-rev20260225 as of mid-2026); v3 is the only current version — there is no v4. Node engine >=22 (matches CORTEX). CalDAV fallback: protocol is RFC 4791 (2007), incremental sync is RFC 6578 WebDAV Collection Sync; recommended Node client is `tsdav` 2.3.0 (WebDAV/CalDAV/CardDAV, TS-native).

## Auth
OAuth 2.0 (authorization-code + long-lived refresh token), all server-side — no browser exposure, consistent with CORTEX Constraint §3. Minimum scope: `https://www.googleapis.com/auth/calendar.readonly` (read all calendars + events). If you only need events (not calendar list metadata) a narrower option exists: `https://www.googleapis.com/auth/calendar.events.readonly`. Prefer the narrowest that works; readonly scopes are non-sensitive-tier friendlier in consent. Reuse the existing Gmail OAuth client (GMAIL_CLIENT_ID/SECRET) — one Google Cloud OAuth app can request Gmail + Calendar scopes together. google-auth-library's OAuth2Client auto-refreshes the access token from the stored refresh_token on each call, so you only persist the refresh token (encrypt at rest per CORTEX §5). CalDAV auth: HTTPS + Basic auth; for iCloud/Fastmail/Google-CalDAV use an app-specific password (iCloud caps at 25, all revoked on primary password change) — never the account password. CalDAV servers frequently 301/302-redirect after login to a partition host (e.g. iCloud p_NN-caldav.icloud.com); the client must follow redirects.

## Key APIs
- **events.list (GET /calendars/{calendarId}/events)** — The single ingestion endpoint. Full-sync params: timeMin/timeMax (RFC3339 lower/upper bounds, exclusive/inclusive by design — filter by event END/START overlap), singleEvents=true (expand recurring series into individual instances), orderBy='startTime' (requires singleEvents=true; other value is 'updated'), maxResults (default 250, hard max 2500), pageToken, timeZone (default = calendar's tz), showDeleted, updatedMin, q. Incremental: pass syncToken instead. Returns items[], nextPageToken, and (only on the final page) nextSyncToken. _(calendarId 'primary' = the operator's main calendar (matches GOOGLE_CALENDAR_ID default). timeMin/timeMax MUST include a timezone offset if no explicit timeZone param.)_
- **Sync guide — syncToken incremental sync** — Canonical algorithm: do a bounded full sync, page to the end, store nextSyncToken; next run pass syncToken to receive only changes since. On HTTP 410 the token is invalid — wipe local state and full-resync. _(docs: /workspace/calendar/api/guides/sync)_
- **Errors guide — 410 GONE** — 410 is returned for an expired/invalidated syncToken (token TTL, ACL changes, or a too-old updatedMin). Handler: drop the stored token and restart with a full sync (no syncToken). _(Distinct from 403 rateLimitExceeded (backoff) and 404.)_
- **Events resource** — Per-event shape you normalize: id, status ('confirmed'|'tentative'|'cancelled'), summary, start/end (EventDateTime), recurringEventId, originalStartTime, updated, recurrence[] (only on the series master when singleEvents=false). _(EventDateTime is either {date:'YYYY-MM-DD'} (all-day) or {dateTime:RFC3339, timeZone}.)_
- **OAuth scopes reference (/workspace/calendar/api/auth)** — Lists calendar.readonly and calendar.events.readonly as the read-only choices. _(Pick minimal scope.)_
- **CalDAV calendar-query REPORT (RFC 4791 §7.8) + RFC 6578 sync-collection** — Fallback for non-Google. Discovery: PROPFIND /.well-known/caldav -> current-user-principal -> calendar-home-set. Read a window: calendar-query REPORT with a VEVENT comp-filter + <C:time-range start=... end=.../> (server expands recurrences you request via <C:expand>). Incremental: RFC 6578 sync-collection REPORT with a DAV:sync-token (the CalDAV analog of Google's syncToken; also returns 'not-found' precondition -> full resync). Cheap change-detection: collection CTag (getctag) + per-resource ETag. _(Use tsdav: createDAVClient({authMethod:'Basic'}), fetchCalendars(), then calendarQuery/syncCollection or the smartCollectionSync helper.)_

## Incremental sync
Two phases keyed per calendarId, persisted alongside the connector state. (1) FULL SYNC (first run, or after 410): call events.list with a bounded window (timeMin=now, timeMax=now+N days for the plan; or timeMin only for open-ended), singleEvents=true, orderBy='startTime', maxResults=2500. Page via nextPageToken until it is absent; the FINAL page (the one with no nextPageToken) carries nextSyncToken — store it. (2) INCREMENTAL SYNC (subsequent runs): call events.list with ONLY syncToken (plus calendarId, maxResults, and singleEvents matching the full sync). The server returns events changed since the token, INCLUDING deletions as items with status='cancelled' (you do NOT set showDeleted — it is implied). Page to the end, capture the new nextSyncToken, replace the stored one. CRITICAL: syncToken is mutually exclusive with the filter params — timeMin, timeMax, q, updatedMin, orderBy, iCalUID, privateExtendedProperty, sharedExtendedProperty all return 400 if combined with it; and singleEvents must be identical to the value used in the originating full sync or you get 400. If any incremental call returns 410 GONE, discard the stored token, wipe/mark-stale the local events for that calendar, and re-run a full sync. CalDAV analog: RFC 6578 sync-collection REPORT returns a DAV:sync-token; a 'valid-sync-token' precondition failure is the 410 equivalent -> full resync. A lighter approach that works everywhere is polling the collection CTag and diffing ETags.

## Gotchas
- syncToken + filters = 400: never send timeMin/timeMax/q/orderBy/updatedMin (etc.) together with syncToken. Branch your params — full-sync params and incremental params are disjoint.
- singleEvents must be consistent across full and incremental syncs, or the incremental call 400s. Pick singleEvents=true (expanded instances) once and keep it.
- nextSyncToken appears ONLY on the last page (when nextPageToken is absent). If you stop paging early you have no valid token — always drain all pages before persisting.
- 410 GONE is normal operationally (tokens expire, ACLs change). It is a control-flow signal, not an error to surface — catch it and full-resync. Detect via err.code===410 or err.response?.status===410 in googleapis.
- Deletions only surface as status==='cancelled' items during incremental sync (or with showDeleted/updatedMin). A plain full sync without showDeleted omits them — so the syncToken path is how you learn an event was removed.
- Cancelled recurring exceptions are guaranteed to populate only id, recurringEventId, and originalStartTime; other fields may be empty. Key deletions on (recurringEventId, originalStartTime), not on summary.
- All-day vs timed: all-day events use start.date/end.date ('YYYY-MM-DD') and end.date is EXCLUSIVE (a one-day event on the 7th has end.date '2026-07-08'). Timed events use start.dateTime/end.dateTime (RFC3339) with an optional start.timeZone. Detect all-day by presence of .date, not by parsing.
- Timezones: the timeZone field is meaningless for all-day events. For CORTEX's 'today/tomorrow' reasoning, resolve all-day dates against CORTEX_TZ (America/New_York), not UTC, or a late-evening event can land on the wrong day. For recurring expansion the series' timeZone drives instance times.
- orderBy='startTime' REQUIRES singleEvents=true; using it on unexpanded series 400s. Note ordering is by the local start of each instance, not stable across DST.
- timeMin/timeMax must carry a timezone (offset or Z) unless you also pass the timeZone param, else 400.
- maxResults hard cap is 2500 (default 250) — set 2500 to minimize round-trips for a busy calendar; it is a page-size hint, not a total limit, so still page.
- Google itself is reachable via CalDAV, but for Google accounts the REST API + syncToken is strictly better (native incremental sync, richer fields). Use CalDAV ONLY for non-Google.
- CalDAV has no universal server-side recurring expansion guarantee: request <C:expand> in calendar-query, but some servers return the master VEVENT + RRULE and you must expand client-side (e.g. rrule/ical.js).
- developers.google.com blocks automated fetch (403) — cite the canonical URLs but verify against the live docs in a browser; the facts here were cross-checked across Google's pages and mirrors.

## Canonical pattern
```ts
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function calendarClient(): calendar_v3.Calendar {
  const auth = new OAuth2Client({
    clientId: process.env.GMAIL_CLIENT_ID,          // reuse the Gmail OAuth app
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
  });
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN }); // auto-refreshes access token
  return google.calendar({ version: 'v3', auth });
}

type NormalizedEvent = {
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled'; // 'cancelled' == deleted in incremental sync
  summary?: string;
  allDay: boolean;
  start?: string;   // RFC3339 instant (timed) OR 'YYYY-MM-DD' (all-day)
  end?: string;     // NOTE: all-day end.date is EXCLUSIVE
  tz?: string;
  recurringEventId?: string;
  originalStart?: string;
  updated?: string;
};

function normalize(e: calendar_v3.Schema$Event): NormalizedEvent {
  const allDay = Boolean(e.start?.date);            // all-day => .date, timed => .dateTime
  return {
    id: e.id!,
    status: (e.status as NormalizedEvent['status']) ?? 'confirmed',
    summary: e.summary ?? undefined,
    allDay,
    start: allDay ? e.start?.date ?? undefined : e.start?.dateTime ?? undefined,
    end:   allDay ? e.end?.date   ?? undefined : e.end?.dateTime   ?? undefined,
    tz: e.start?.timeZone ?? undefined,
    recurringEventId: e.recurringEventId ?? undefined,
    originalStart: e.originalStartTime?.dateTime ?? e.originalStartTime?.date ?? undefined,
    updated: e.updated ?? undefined,
  };
}

// Persist { syncToken } per calendarId. Pass the stored token, or null on first run.
export async function ingest(
  calendarId: string,
  stored: { syncToken?: string | null },
  onEvent: (e: NormalizedEvent) => Promise<void>,
): Promise<{ syncToken: string }> {
  const cal = calendarClient();

  // Full sync: bounded window + expanded instances + startTime order.
  // Incremental sync: ONLY the syncToken (filters are forbidden -> 400).
  const base: calendar_v3.Params$Resource$Events$List = stored.syncToken
    ? { calendarId, syncToken: stored.syncToken, singleEvents: true, maxResults: 2500 }
    : {
        calendarId,
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 30 * 864e5).toISOString(), // next 30 days for the plan
        singleEvents: true,   // expand recurring events into instances
        orderBy: 'startTime', // requires singleEvents:true
        maxResults: 2500,
      };

  let pageToken: string | undefined;
  let newSyncToken: string | undefined;

  try {
    do {
      const { data } = await cal.events.list({ ...base, pageToken });
      for (const e of data.items ?? []) await onEvent(normalize(e)); // status:'cancelled' => delete locally
      pageToken = data.nextPageToken ?? undefined;
      newSyncToken = data.nextSyncToken ?? newSyncToken; // present ONLY on the final page
    } while (pageToken);
  } catch (err: any) {
    if (err?.code === 410 || err?.response?.status === 410) {
      // Token expired/invalidated: wipe local state for this calendar, then full-resync.
      return ingest(calendarId, { syncToken: null }, onEvent);
    }
    throw err;
  }

  return { syncToken: newSyncToken! };
}

/* CalDAV fallback (non-Google) with tsdav 2.3.0 — read-only window:
import { createDAVClient } from 'tsdav';
const client = await createDAVClient({
  serverUrl: 'https://caldav.fastmail.com/',            // or /.well-known/caldav
  credentials: { username, password: appSpecificPassword },
  authMethod: 'Basic', defaultAccountType: 'caldav',
});
const [calendar] = await client.fetchCalendars();
const objects = await client.calendarQuery({
  url: calendar.url,
  filters: [{ 'comp-filter': { _attributes: { name: 'VCALENDAR' },
    'comp-filter': { _attributes: { name: 'VEVENT' },
      'time-range': { _attributes: { start: '20260707T000000Z', end: '20260807T000000Z' } } } } }],
});
// objects[].data = raw iCalendar (VEVENT). Parse with ical.js / node-ical; expand RRULE client-side if server didn't.
// Incremental: client.syncCollection({ url, syncLevel: 1, syncToken }) (RFC 6578); on invalid token -> full resync. */
```

## Recommendation for CORTEX
Build the CORTEX Google Calendar adapter on `googleapis` 173 with events.list + syncToken as the sole ingestion path — do NOT use CalDAV for Google. Reuse the Gmail OAuth client and request only `https://www.googleapis.com/auth/calendar.readonly` (or calendar.events.readonly). Store one refresh token, encrypted at rest; let google-auth-library mint access tokens. Model the adapter as a two-branch pull keyed by GOOGLE_CALENDAR_ID (default 'primary'): (1) first run / post-410 = full sync with timeMin=now, timeMax=now+30d (comfortably covers the nightly Tomorrow Plan horizon), singleEvents=true, orderBy='startTime', maxResults=2500, drained across all pages, persisting the terminal nextSyncToken per calendar; (2) every subsequent nightly run = incremental with ONLY the syncToken, applying status==='cancelled' items as local deletes. Wrap the call in a 410 catch that clears the stored token, marks that calendar's cached events stale, and recurses into a full sync — this is expected maintenance, not an alert. Normalize at the boundary: detect all-day via presence of start.date, treat all-day end.date as exclusive, and resolve all-day dates against CORTEX_TZ (America/New_York) so 'tomorrow' is correct for the CORTEX_BRIEF_HOUR=20 cutoff; keep timed events as RFC3339 instants and carry start.timeZone. Because singleEvents=true is used, the API returns pre-expanded recurring instances — the plan needs no RRULE engine. Add CalDAV (via tsdav 2.3.0, RFC 4791 calendar-query + RFC 6578 sync-collection, app-specific passwords, follow post-login redirects) strictly as an optional Phase-3+ adapter for non-Google calendars (iCloud/Fastmail/self-hosted), gated behind its own env block; expect to expand recurrences client-side for servers that don't honor <C:expand>. Persist per-calendar sync state (syncToken for Google, DAV:sync-token/CTag for CalDAV) in the same connector-state store you use for Gmail's historyId, so the nightly job is idempotent and cheap.

## Citations
- [Events: list — Google Calendar API v3 reference (params, syncToken incompatibilities, nextSyncToken)](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
- [Synchronize resources efficiently — full sync, syncToken incremental sync, 410 full-resync](https://developers.google.com/workspace/calendar/api/guides/sync)
- [Handle API errors — 410 GONE (invalid syncToken) and recovery](https://developers.google.com/workspace/calendar/api/guides/errors)
- [Events resource — status 'cancelled', recurringEventId, originalStartTime, EventDateTime (date vs dateTime)](https://developers.google.com/workspace/calendar/api/v3/reference/events)
- [Recurring events guide — singleEvents expansion and instances](https://developers.google.com/workspace/calendar/api/guides/recurringevents)
- [Choose Google Calendar API scopes — calendar.readonly / calendar.events.readonly](https://developers.google.com/workspace/calendar/api/auth)
- [Calendars & events concepts — all-day vs timed, timeZone semantics](https://developers.google.com/workspace/calendar/api/concepts/events-calendars)
- [googleapis (npm) — current version 173.0.0](https://www.npmjs.com/package/googleapis)
- [Params$Resource$Events$List — googleapis Node TS type reference](https://googleapis.dev/nodejs/googleapis/latest/calendar/interfaces/Params$Resource$Events$List.html)
- [RFC 4791 — Calendaring Extensions to WebDAV (CalDAV): calendar-query REPORT + time-range](https://www.rfc-editor.org/rfc/rfc4791.html)
- [RFC 6578 — WebDAV Collection Synchronization (CalDAV sync-token, the syncToken analog)](https://www.rfc-editor.org/rfc/rfc6578.html)
- [tsdav — WebDAV/CalDAV/CardDAV client for Node (fallback for non-Google calendars)](https://www.npmjs.com/package/tsdav)
