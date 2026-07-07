# Gmail API

_Surface:_ Gmail REST API v1 — read-only personal-inbox ingester (Node/TypeScript via the official `googleapis` client). Core surface: users.messages.list, users.messages.get, users.messages.attachments.get, users.history.list (incremental), users.watch/users.stop (+ Cloud Pub/Sub) for push, users.getProfile for the initial historyId. Auth is Google OAuth 2.0 (authorization-code + refresh token) with the restricted `gmail.readonly` scope.

## Current version
Gmail API: v1 (discovery revision ~rev20260525 as of mid-2026). Client libs: official `googleapis` Node client (v14x line in 2026) which bundles `google-auth-library` (v9+). Base URL: https://gmail.googleapis.com/gmail/v1. Note: Google moved Gmail API docs under the /workspace/ path (developers.google.com/workspace/gmail/api/...); old /gmail/api/... URLs redirect. Per-method quota costs were revised on 2026-05-01 (messages.get is now 20 units, up from the long-standing 5).

## Auth
OAuth 2.0 authorization-code flow with offline access (refresh token). For a self-hosted server, create an OAuth client of type "Web application" in Google Cloud Console with a redirect URI you control (e.g. https://your-vps/oauth2/callback, or http://localhost:PORT/callback for a homelab). Flow: generateAuthUrl({access_type:'offline', prompt:'consent', scope:[gmail.readonly]}) → user consents once → getToken(code) → persist the refresh_token. The googleapis OAuth2 client auto-refreshes the ~1h access_token whenever a refresh_token is set; subscribe to the client's 'tokens' event to re-persist rotated tokens. MINIMUM SCOPE for read: https://www.googleapis.com/auth/gmail.readonly (full read of messages, threads, labels, settings, and bodies+attachments). If you only need headers/metadata (no bodies), https://www.googleapis.com/auth/gmail.metadata exists but it BLOCKS format=full/raw and q= search. Both gmail.readonly and gmail.metadata are RESTRICTED scopes: a production app serving >100 users must pass Google OAuth verification + a CASA security assessment (because you store mailbox data). A single-user personal ingester avoids that by keeping the OAuth app either in "Testing" publishing status (you are the test user) or in Production and clicking through the "unverified app" warning as the sole owner.

## Key APIs
- **users.getProfile** — Seed the sync cursor: returns emailAddress, messagesTotal, threadsTotal, and the mailbox's current historyId. _(1 quota unit. Simplest way to obtain a fresh baseline historyId before/after a full backfill.)_
- **users.messages.list** — Enumerate message IDs for backfill or a targeted query. _(5 units. Returns only {id, threadId} stubs plus nextPageToken and resultSizeEstimate — you must call messages.get per ID. Params: q (Gmail search syntax e.g. 'in:inbox', 'newer_than:30d'), labelIds (e.g. ['INBOX']), maxResults (default 100, max 500), pageToken, includeSpamTrash.)_
- **users.messages.get** — Fetch one message. format=full for headers+parsed body, format=metadata for headers only, format=minimal for ids/labels only, format=raw for the RFC 2822 blob (base64url in .raw). _(20 units (full/metadata/minimal all 20 in the 2026 table; raw costs more). Returns id, threadId, labelIds[], snippet, historyId, internalDate (epoch ms received time), sizeEstimate, payload. gmail.metadata scope only permits format=metadata. Use format=metadata to index headers cheaply, format=full to store bodies.)_
- **payload (MessagePart tree)** — Extract headers, MIME bodies, and attachment refs from a full message. _(payload.headers = [{name,value}] (From/To/Cc/Subject/Date/Message-ID — case-insensitive match). Body bytes live in payload.body.data (single-part) or are split across payload.parts[] (recurse). Data is BASE64URL — decode with Buffer.from(data,'base64url'). Walk parts for text/plain + text/html; a part with filename + body.attachmentId is an attachment stub.)_
- **users.messages.attachments.get** — Download attachment bytes (not inlined for large attachments). _(Endpoint: messages/{messageId}/attachments/{id}. Returns {size, data} with data as base64url. Call on demand using the attachmentId from the payload part.)_
- **users.history.list** — Incremental sync: list mailbox changes since a stored historyId. _(2 units — cheapest way to stay current. Params: startHistoryId (required), historyTypes[] (messageAdded, messageDeleted, labelAdded, labelRemoved), labelId filter, pageToken, maxResults. Response: history[] (each with messagesAdded/messagesDeleted/labelsAdded/labelsRemoved), nextPageToken, and a top-level historyId to store as the new cursor. Returns HTTP 404 when startHistoryId is too old → fall back to full sync.)_
- **users.watch** — Register Gmail→Cloud Pub/Sub push for real-time change notifications. _(requestBody: {topicName:'projects/PID/topics/NAME', labelIds:['INBOX'], labelFilterBehavior:'INCLUDE'}. Response: {historyId, expiration} (expiration is epoch-ms, ~7 days out). A new watch replaces the prior one (one active watch per mailbox). Re-call at most every 7 days; Google recommends daily.)_
- **users.stop** — Cancel push notifications for the mailbox. _(No body; stops all watch delivery for that user.)_
- **Batch endpoint (/batch/gmail/v1)** — Bundle up to 100 sub-requests (e.g. many messages.get) into one multipart/mixed HTTP request. _(The GLOBAL www.googleapis.com/batch endpoint was discontinued; use the API-specific https://gmail.googleapis.com/batch/gmail/v1. Recommend <=50 inner requests to avoid rate limiting. Batching cuts HTTP round-trips but NOT quota — each sub-request still bills its own units. The googleapis Node client has no first-class batch helper, so bounded-concurrency messages.get calls (e.g. p-limit) are usually the simpler equivalent.)_

## Incremental sync
Cursor is the mailbox historyId (a monotonically increasing per-mailbox integer). Bootstrap: do a full backfill via messages.list+messages.get, then store the historyId from users.getProfile (or from the newest message / the users.watch response) as your checkpoint. Steady state: call users.history.list({startHistoryId: <stored>, historyTypes:['messageAdded', ...]}), page through nextPageToken accumulating changed message IDs, then persist the response's top-level historyId as the new checkpoint (advance it even across pages). Fetch each new/changed ID with messages.get. Critical failure mode: historyId is only guaranteed valid ~1 week (occasionally only hours); if startHistoryId is too old, history.list returns HTTP 404 (code 404) → discard the cursor and run a full sync, then re-seed the historyId. Never store historyId=0 (invalid). Two ways to trigger a sync: (a) cron poll history.list every N minutes (simplest, works anywhere), or (b) event-driven via users.watch → Pub/Sub, where each notification carries a new historyId that you use as a signal to run history.list (don't trust the delta in the push alone — always reconcile with history.list, and notifications may be duplicated or out of order).

## Gotchas
- gmail.readonly (and gmail.metadata) are RESTRICTED scopes. A multi-user production app must pass Google OAuth verification + an annual CASA Tier-2 security assessment because it stores mailbox data. A personal single-user ingester sidesteps this by staying in 'Testing' publishing status or self-approving the unverified-app warning.
- BIGGEST personal-app trap: in 'Testing' publishing status, refresh tokens EXPIRE after 7 days, silently killing a long-running ingester. Fix: move the OAuth app to 'In production' (as the sole owner you can click Advanced → Go to app past the unverified warning and get a non-expiring refresh token), or re-run consent on a schedule.
- Refresh tokens are only returned on the FIRST consent unless you pass prompt:'consent' with access_type:'offline'. Capture and persist it immediately; the 'tokens' event on the OAuth2 client is where rotated tokens surface.
- historyId can expire in as little as a few hours (typically ~1 week). ALWAYS catch HTTP 404 from history.list and fall back to a full sync; never persist historyId 0.
- users.watch expires in <=7 days and stops SILENTLY with no error if not renewed. Run a daily renewal cron. A fresh watch replaces the previous one (only one per mailbox).
- Body data is base64URL, not standard base64 — decode with Buffer.from(x,'base64url'). Bodies are frequently nested across payload.parts (multipart/alternative, multipart/mixed); recurse the part tree. Large attachment bytes are NOT inlined — fetch them via messages.attachments.get using the part's attachmentId.
- messages.list only returns {id, threadId} stubs — you pay a separate messages.get (20 units) per message. Backfilling a large inbox is the expensive step; use format=metadata where bodies aren't needed.
- 2026 quota reality for a SINGLE mailbox: the 250 quota-units/user/second cap is the real bottleneck. At 20 units per messages.get that's ~12 messages/sec sustained before HTTP 429/403 rateLimitExceeded. Use exponential backoff + bounded concurrency (~5-10). The per-project daily budget is effectively unlimited for one inbox.
- The global HTTP batch endpoint (www.googleapis.com/batch) is discontinued; only the Gmail-specific /batch/gmail/v1 works, and batching does not reduce quota cost. Concurrent messages.get with a concurrency limiter is usually simpler than assembling multipart batches by hand.
- Use message.internalDate (epoch ms, Gmail receipt time) for ordering — the RFC 'Date' header is sender-supplied and unreliable. Use Gmail message.id/threadId (not the RFC Message-ID header) as your primary key.
- Pub/Sub PUSH subscriptions require a publicly reachable HTTPS endpoint with a valid (non-self-signed) TLS cert. A homelab behind NAT cannot receive push directly — use a PULL subscription (a worker calls pull/streamingPull + ack) or a tunnel (Cloudflare Tunnel/ngrok). For a personal inbox, plain cron polling of history.list avoids Pub/Sub entirely.

## Canonical pattern
```ts
import { google, gmail_v1 } from 'googleapis';

// 1) OAuth2 ("Web application" client). Auto-refreshes the ~1h access token.
const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
// one-time: const url = oauth2.generateAuthUrl({ access_type:'offline', prompt:'consent',
//   scope:['https://www.googleapis.com/auth/gmail.readonly'] });
// then: const { tokens } = await oauth2.getToken(code); // persist tokens.refresh_token
oauth2.setCredentials({ refresh_token: STORED_REFRESH_TOKEN });
oauth2.on('tokens', t => { if (t.refresh_token) persist(t.refresh_token); });
const gmail = google.gmail({ version: 'v1', auth: oauth2 });

// 2) Backfill: list ids -> get each (format:'full')
async function* ids(q = 'in:inbox') {
  let pageToken: string | undefined;
  do {
    const { data } = await gmail.users.messages.list({ userId:'me', q, maxResults:500, pageToken });
    for (const m of data.messages ?? []) yield m.id!;
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
}
const getMsg = (id: string) =>
  gmail.users.messages.get({ userId:'me', id, format:'full' }).then(r => r.data);

// 3) Extract headers/body/attachments
const dec = (d?: string|null) => d ? Buffer.from(d, 'base64url').toString('utf8') : '';
const hdr = (m: gmail_v1.Schema$Message, n: string) =>
  m.payload?.headers?.find(h => h.name?.toLowerCase() === n.toLowerCase())?.value;
function walk(p: gmail_v1.Schema$MessagePart | undefined,
             acc = { text:'', html:'', atts:[] as any[] }) {
  if (!p) return acc;
  if (p.filename && p.body?.attachmentId)
    acc.atts.push({ filename:p.filename, mimeType:p.mimeType, attachmentId:p.body.attachmentId });
  else if (p.mimeType === 'text/plain') acc.text += dec(p.body?.data);
  else if (p.mimeType === 'text/html') acc.html += dec(p.body?.data);
  (p.parts ?? []).forEach(c => walk(c, acc));
  return acc;
}

// 4) Incremental sync (store the returned historyId; 404 => full resync)
async function sync(startHistoryId: string) {
  const changed = new Set<string>(); let pageToken: string | undefined;
  try {
    do {
      const { data } = await gmail.users.history.list({
        userId:'me', startHistoryId, historyTypes:['messageAdded'], pageToken });
      for (const h of data.history ?? [])
        for (const a of h.messagesAdded ?? []) changed.add(a.message!.id!);
      pageToken = data.nextPageToken ?? undefined;
      if (data.historyId) startHistoryId = data.historyId;   // advance cursor
    } while (pageToken);
    return { newHistoryId: startHistoryId, ids: [...changed] };
  } catch (e: any) {
    if (e.code === 404) return { needsFullSync: true };
    throw e;
  }
}

// 5) Optional push: register watch, renew daily (< 7 days)
const watch = () => gmail.users.watch({ userId:'me', requestBody:{
  topicName:'projects/PROJECT_ID/topics/gmail-inbox',
  labelIds:['INBOX'], labelFilterBehavior:'INCLUDE' }}); // -> { historyId, expiration }
```

## Recommendation for CORTEX
For CORTEX's read-only personal-inbox adapter, keep it deliberately simple and cron-driven; reserve Pub/Sub for later. Concretely: (1) Auth — register ONE "Web application" OAuth client, request only gmail.readonly, run the offline+consent flow once, and store the refresh_token in your secrets store. Move the OAuth app to "In production" publishing status (self-approve the unverified-app screen as the mailbox owner) so the refresh token does not expire in 7 days. Wrap the googleapis OAuth2 client's 'tokens' event to persist rotations; the client handles access-token refresh automatically. (2) Backfill — one pass of messages.list (q='in:inbox' or '' for all mail, maxResults 500) → messages.get with format='full', run through a bounded-concurrency pool (p-limit ~5-8) with exponential backoff on 429/403 rateLimitExceeded, staying under 250 units/user/sec (~12 full gets/sec). Normalize into your schema keyed by Gmail message.id, using internalDate for time and decoding base64url bodies via the recursive part-walker; pull attachment bytes lazily via messages.attachments.get. Persist getProfile().historyId as the checkpoint AFTER the backfill completes. (3) Incremental — a scheduler (e.g. every 1-5 min) calls users.history.list from the stored historyId, dedupes changed IDs, messages.get's them, and advances the checkpoint; on HTTP 404 wipe the checkpoint and re-backfill. This design is idempotent, needs no inbound network, and works identically on a VPS or a homelab-behind-NAT. (4) Only if you need sub-minute latency: add users.watch → Pub/Sub with a DAILY renewal job. On a VPS, use a push subscription to a public HTTPS webhook (Let's Encrypt cert; verify the Pub/Sub OIDC JWT). Behind NAT, use a PULL subscription with a long-running worker (streamingPull + ack) — no public endpoint required. In both cases treat the notification only as a trigger and reconcile the actual deltas through history.list. Store historyId as a string/int64 (it exceeds 2^53 risk is low but treat as string to be safe).

## Citations
- [Choose Gmail API scopes (gmail.readonly, gmail.metadata; restricted-scope verification)](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [OAuth 2.0 for Web Server Applications (offline access, refresh tokens, consent)](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Using OAuth 2.0 — token expiration / testing-mode 7-day refresh token expiry](https://developers.google.com/identity/protocols/oauth2)
- [Method: users.messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Method: users.messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- [Gmail API Format enum (minimal / full / metadata / raw)](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format)
- [Method: users.messages.attachments.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages.attachments/get)
- [Synchronizing clients with Gmail (full vs partial sync, historyId, 404 handling)](https://developers.google.com/workspace/gmail/api/guides/sync)
- [Method: users.history.list (startHistoryId, historyTypes, pageToken)](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)
- [Configure push notifications in Gmail API (users.watch, Pub/Sub topic, gmail-api-push@system.gserviceaccount.com, 7-day renewal)](https://developers.google.com/workspace/gmail/api/guides/push)
- [Method: users.watch (topicName, labelIds, labelFilterBehavior; response historyId, expiration)](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch)
- [Batch requests | Gmail (API-specific /batch/gmail/v1, 100-request limit, multipart/mixed)](https://developers.google.com/workspace/gmail/api/guides/batch)
- [Usage limits | Gmail (quota units per method, 250 units/user/sec, per-project limits, 2026 update)](https://developers.google.com/workspace/gmail/api/reference/quota)
- [Cloud Pub/Sub — Push subscriptions (public HTTPS endpoint requirement)](https://cloud.google.com/pubsub/docs/push)
- [Cloud Pub/Sub — Pull subscriptions (worker polling; behind-NAT option)](https://cloud.google.com/pubsub/docs/pull)
- [google-auth-library-nodejs README (generateAuthUrl, offline access, 'tokens' event)](https://github.com/googleapis/google-auth-library-nodejs)
- [googleapis Node.js client (google.gmail('v1'), OAuth2 setup)](https://github.com/googleapis/google-api-nodejs-client)
