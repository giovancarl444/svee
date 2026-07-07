# IMAP (imapflow)

_Surface:_ imapflow — modern promise-based IMAP client for Node.js (by Postal Systems / postalsys, the library behind EmailEngine and part of the WildDuck/zone-eu ecosystem). Read-only IMAP ingestion: connect over TLS, EXAMINE a mailbox, UID-based incremental FETCH, IDLE for push, mailparser for body/attachment parsing. Pairs with mailparser (simpleParser) for MIME decoding. CommonJS, ships bundled TypeScript definitions (lib/imap-flow.d.ts) so no @types needed.

## Current version
imapflow 1.4.6 (latest, published 2026-07-05) — verified via `npm view imapflow version`. The 1.4.x line (1.4.0 2026-06-09 → 1.4.6) is almost entirely dependency bumps (nodemailer 9, mailsplit 5.4.14, libmime 5.4.1); the last feature was Gmail label search (1.4.0). mailparser 3.9.14 (latest). Both are CommonJS (`type: commonjs`), no `engines` pin but CI runs Node 22.x and 24.x — target Node 18+ (Node 20/22 LTS recommended). imapflow bundles its own `.d.ts`; mailparser has @types/mailparser if needed but ships usable JS.

## Auth
Transport: `secure: true` + `port: 993` for implicit TLS (what you want). `secure:false` upgrades via STARTTLS only if offered. Two auth modes on the `auth` object:
1. App-specific password (Gmail with 2FA, Yahoo, Fastmail, etc.): `auth: { user, pass }`. Basic LOGIN/PLAIN is dead for consumer Google/Microsoft unless it's an app password.
2. XOAUTH2: `auth: { user, accessToken }` — pass the OAuth2 *access token* (NOT refresh token); imapflow builds the SASL `user=<email>\x01auth=Bearer <token>\x01\x01` string itself. There is NO built-in token refresh: you fetch/refresh the access token yourself before `connect()`, and on `AuthenticationFailure` (exported class; has `.authenticationFailed`, `.serverResponseCode`, `.oauthError`) you refresh and reconnect with a fresh instance.
Minimum OAuth scopes: Gmail → `https://mail.google.com/` (full-mailbox scope; there is no narrower IMAP scope) plus `offline_access`-equivalent (Google returns refresh token with `access_type=offline`). Microsoft 365 → `https://outlook.office365.com/IMAP.AccessAsUser.All` + `offline_access`, and the tenant must have IMAP + OAuth enabled (basic auth is disabled by Microsoft). Shared/delegated M365 mailboxes: imapflow also supports SASL PLAIN `auth.authzid` (authenticate as user, authorize as authzid) and `auth.loginMethod` override.

## Key APIs
- **new ImapFlow(options)** — Create client. Key opts: host, port, secure, auth{user,pass|accessToken,authzid,loginMethod}, logger(false to silence)|emitLogs, clientInfo(ID ext), tls, connectionTimeout(90s), greetingTimeout(16s), socketTimeout(5min), disableAutoIdle, maxIdleTime, missingIdleCommand('NOOP'|'SELECT'|'STATUS'), qresync, disableCompression, proxy(SOCKS/HTTP), maxLockHoldTime. _(connect() may be called ONCE per instance — reconnect = build a new ImapFlow.)_
- **await client.connect()** — Open TCP+TLS, greet, ID, authenticate, ENABLE extensions. Throws on connection/auth failure. _(After this, capabilities/enabled Sets are populated.)_
- **client.mailboxOpen(path,{readOnly})** — SELECT/EXAMINE a folder; returns MailboxObject. Use readOnly:true (EXAMINE) for a pure ingester so fetching bodies never sets \Seen. _(Result & client.mailbox expose uidValidity(BigInt), uidNext(number), exists(count), highestModseq(BigInt), flags/permanentFlags(Set).)_
- **client.getMailboxLock(path,{readOnly,acquireTimeout})** — Opens mailbox if needed and serializes access; returns {path, release()}. Wrap fetch bursts and ALWAYS release() in finally. _(Prevents interleaving commands across concurrent tasks on one connection.)_
- **client.fetch(range,query,{uid,changedSince})** — AsyncIterableIterator of FetchMessageObject. query flags: uid, flags, envelope, bodyStructure, internalDate, size, source(bool|{start,maxLength}), headers(bool|string[]), bodyParts, threadId, labels; macros fast/all/full. options.uid=true makes range a UID range; changedSince(BigInt) needs CONDSTORE for flag-delta sync. _(seq+uid always returned. Streams — memory-efficient for large mailboxes.)_
- **client.fetchOne(seq,query,{uid}) / fetchAll(range,query,{uid})** — Single message / materialized array variants of fetch. _(fetchOne(client.mailbox.exists,{...}) grabs the newest message.)_
- **client.download(range,part,{uid,maxBytes,chunkSize})** — Stream full RFC822 or a single BODYSTRUCTURE part as {meta{contentType,filename,encoding,charset,disposition}, content:Readable}. downloadMany() returns several parts as Buffers. _(Preferred for large attachments — stream one part instead of parsing whole source.)_
- **client.search(query,{uid,returnOptions})** — Server-side SEARCH → number[] (or ESEARCH result with returnOptions). query supports uid range, since/before(Date), unseen, header{}, gmraw, labels{has,not}. _(Alternative incremental strategy: search({uid:`${last+1}:*`},{uid:true}).)_
- **client.idle()** — Enter IDLE to receive push notifications. Auto-started ~15s after each command when a mailbox is SELECTED unless disableAutoIdle. Only call manually if disableAutoIdle:true. _(maxIdleTime breaks+restarts IDLE every N ms; missingIdleCommand used when server lacks IDLE.)_
- **Events: exists, expunge, flags, mailboxOpen, mailboxClose, close, error, log, response** — 'exists'({path,count,prevCount}) => new mail arrived, trigger a fetch. 'expunge'({uid|seq,vanished}). 'flags'({uid,flags:Set}). 'close'/'error' => connection gone, reconnect. _(With qresync:true, expunge carries UID not seq.)_
- **simpleParser(source, [opts]) (mailparser)** — Parse a raw message Buffer/stream into {subject, from, to, date, text, html, textAsHtml, headers(Map), attachments[{filename,contentType,size,content:Buffer,cid}], messageId, inReplyTo, references}. _(Use msg.source (source:true) as input. Good for snippet = parsed.text.slice(0,N).)_
- **client.logout() / client.close()** — Graceful LOGOUT vs immediate socket teardown. _(Call in shutdown; on hard errors just let 'close' fire and reconnect.)_

## Incremental sync
UID-based, the canonical IMAP incremental pattern. Persist a checkpoint per folder: {uidValidity: string, lastSeenUid: number}.
1. On open, read `client.mailbox.uidValidity` (a BigInt — store as string). If it differs from the stored value, the server has renumbered UIDs: discard lastSeenUid, reset to 0, and full-resync (nothing else is safe).
2. Fetch new messages with a UID range from lastSeenUid+1: `client.fetch(`${lastSeenUid+1}:*`, {uid:true, envelope:true, internalDate:true, source:true, ...}, {uid:true})`. CRITICAL quirk: in IMAP `N:*` always matches the single highest message even when N is already past the newest UID (because `*` = highest UID and a range must return ≥1 msg). So you MUST guard `if (msg.uid <= lastSeenUid) continue;` to avoid re-ingesting the newest message every poll. Advance `lastSeenUid = max(lastSeenUid, msg.uid)` as you go.
3. Push mode: keep the mailbox open; imapflow auto-IDLEs. On the `exists` event, run the same drainNew() to pull messages above lastSeenUid.
4. Optional flag/label-change sync (read status, deletions): if the server has CONDSTORE, store `highestModseq` (BigInt) and use `fetch(range,{flags:true},{changedSince: storedModseq})` to get only messages whose flags changed; listen to `expunge` for deletions. QRESYNC (`qresync:true`) makes expunge report UIDs directly.
An equally valid alternative to step 2 is server-side `search({uid:`${lastSeenUid+1}:*`},{uid:true})` then fetch the returned UID list — avoids the `N:*` phantom-message quirk at the cost of an extra round trip.

## Gotchas
- N:* UID-range phantom: fetching `${last+1}:*` returns the highest message even when last is already the newest UID. Always filter `msg.uid > lastSeenUid` or you re-ingest the last email on every empty poll.
- BigInt fields: uidValidity, uidNext(number, ok), highestModseq, modseq, and search modseq are BigInt. JSON.stringify throws on BigInt — convert with .toString() before persisting a checkpoint. Compare uidValidity as string/BigInt, never coerce to Number (can exceed 2^53).
- No auto-reconnect, and connect() can be called only ONCE per instance ('Can not re-use ImapFlow instance'). A dropped connection means constructing a brand-new ImapFlow and calling connect() again — wrap in a supervisor loop with exponential backoff. Listen to both 'close' and 'error'.
- socketTimeout defaults to 5 min. During IDLE, a socket timeout triggers a built-in self-heal (NOOP then re-IDLE), so silent servers don't kill the connection; but a truly dead TCP (NAT/firewall dropped the flow) surfaces the failed NOOP as 'close'/'error' — that's your reconnect signal, not a bug.
- IDLE has server-side limits: Gmail/many servers drop IDLE after ~29 minutes. Set `maxIdleTime` (e.g. 5–10 min) to proactively break+restart IDLE, which also acts as a liveness probe. Auto-IDLE starts ~15s after the last command unless disableAutoIdle:true.
- Read-only intent: open with `{readOnly:true}` (EXAMINE) so fetching message bodies never sets the \Seen flag. A plain SELECT + fetching the full body will mark messages read on many servers.
- Attachments: parsing whole message with simpleParser(source) downloads the entire RFC822 — expensive for big attachments. Prefer bodyStructure + client.download(uid, partId, {uid:true}) to stream only the part you want, or downloadMany for several parts.
- Sets aren't JSON: flags, permanentFlags, labels, and enabled are JS Set objects; envelope.from/to are arrays of {name,address}. Normalize before storing.
- Mailbox locking: hold getMailboxLock only for the duration of a fetch burst and release() in finally. Holding a lock for a long-running IDLE listener defeats concurrency and trips the maxLockHoldTime warning (default 30 min).
- Gmail specifics: needs an app password (2FA) or OAuth2; folders are labels — INBOX plus [Gmail]/All Mail, [Gmail]/Sent Mail; threadId/labels require the X-GM-EXT-1 extension; a message can appear under multiple labels. Deleting/moving semantics differ from stock IMAP.
- XOAUTH2 accessToken expiry: imapflow does not refresh tokens; an expired token throws AuthenticationFailure at connect. Refresh out-of-band and reconnect. Pass the access token, not the refresh token.
- Pure-CommonJS library (intentionally, so EmailEngine can bundle it with pkg). In an ESM/TS project import via `import { ImapFlow } from 'imapflow'` works through the CJS interop, but there is no native ESM entry.

## Canonical pattern
```ts
import { ImapFlow, type ImapFlowOptions } from 'imapflow';
import { simpleParser } from 'mailparser';

type Checkpoint = { uidValidity: string; lastSeenUid: number };

function makeClient(): ImapFlow {
  const opts: ImapFlowOptions = {
    host: 'imap.gmail.com',
    port: 993,
    secure: true,                       // implicit TLS
    auth: process.env.OAUTH_ACCESS_TOKEN
      ? { user: USER, accessToken: process.env.OAUTH_ACCESS_TOKEN } // XOAUTH2
      : { user: USER, pass: APP_PASSWORD },                         // app password
    logger: false,
    maxIdleTime: 5 * 60_000,            // cycle IDLE (Gmail drops ~29 min) + liveness probe
    // disableAutoIdle: false (default) => library auto-enters IDLE between commands
  };
  return new ImapFlow(opts);
}

async function drainNew(client: ImapFlow, cp: Checkpoint, onMsg: (m: any) => Promise<void>) {
  const lock = await client.getMailboxLock('INBOX', { readOnly: true });
  try {
    // N:* phantom guard: filter uid > lastSeenUid explicitly.
    for await (const msg of client.fetch(
      `${cp.lastSeenUid + 1}:*`,
      { uid: true, envelope: true, internalDate: true, size: true, source: true },
      { uid: true }
    )) {
      if (msg.uid <= cp.lastSeenUid) continue;
      const parsed = await simpleParser(msg.source!);
      await onMsg({
        uid: msg.uid,
        subject: msg.envelope?.subject,
        from: msg.envelope?.from,
        date: msg.envelope?.date ?? msg.internalDate,
        snippet: (parsed.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
        html: parsed.html || undefined,
        attachments: parsed.attachments.map(a => ({
          filename: a.filename, contentType: a.contentType, size: a.size,
        })),
      });
      cp.lastSeenUid = Math.max(cp.lastSeenUid, msg.uid);
    }
  } finally {
    lock.release();
  }
}

// One session; resolves when the connection drops so the supervisor can reconnect.
async function session(cp: Checkpoint, onMsg: (m: any) => Promise<void>, save: (c: Checkpoint) => Promise<void>) {
  const client = makeClient();
  client.on('error', err => console.error('imap error', err));
  await client.connect();
  await client.mailboxOpen('INBOX', { readOnly: true });      // EXAMINE: never sets \Seen

  const uidValidity = client.mailbox && client.mailbox.uidValidity.toString(); // BigInt!
  if (uidValidity !== cp.uidValidity) cp = { uidValidity: uidValidity!, lastSeenUid: 0 };

  await drainNew(client, cp, onMsg); await save(cp);          // catch up on offline backlog
  client.on('exists', () => {                                 // push: new mail during IDLE
    drainNew(client, cp, onMsg).then(() => save(cp)).catch(e => console.error(e));
  });

  await new Promise<void>(res => client.once('close', () => res()));
  return cp;
}

// Supervisor: connect() is single-use, so reconnect = fresh ImapFlow, with backoff.
export async function run(initial: Checkpoint, onMsg: (m: any) => Promise<void>, save: (c: Checkpoint) => Promise<void>) {
  let cp = initial;
  for (let backoff = 1000; ; backoff = Math.min(backoff * 2, 60_000)) {
    try { cp = await session(cp, onMsg, save); backoff = 1000; }
    catch (err) { console.error('session failed', err); }
    await new Promise(r => setTimeout(r, backoff + Math.random() * 1000));
  }
}
```

## Recommendation for CORTEX
Use imapflow 1.4.6 + mailparser 3.9.14; both ship as CommonJS and imapflow bundles its own TypeScript defs, so no @types packages. For CORTEX's read-only ingester adapter:
1. Model it as a supervised long-lived session (see codePattern): one ImapFlow instance per account, a fresh instance on every reconnect (connect() is single-use), exponential backoff on the outer loop. Treat the `close`/`error` events as the reconnect trigger; do not try to recycle a client.
2. Always open with `{readOnly:true}` (EXAMINE) so ingestion never mutates \Seen.
3. Persist a per-folder checkpoint {uidValidity: string, lastSeenUid: number}; on open, reset to lastSeenUid=0 if uidValidity changed. Store uidValidity as a string (BigInt is not JSON-serializable).
4. Incremental pull = `fetch(`${last+1}:*`, {...}, {uid:true})` with the mandatory `uid > lastSeenUid` filter (or search({uid:`${last+1}:*`}) to sidestep the N:* phantom). Advance and persist lastSeenUid transactionally with your downstream write so a crash mid-batch replays rather than skips.
5. Push via the built-in auto-IDLE: subscribe to `exists` and call the same drain function. Set `maxIdleTime` to ~5 min for always-on liveness and to stay under Gmail's ~29-min IDLE cap. Rely on imapflow's socket-timeout NOOP self-heal; only reconnect on actual close.
6. Fetch envelope+internalDate+size+source for the common path and run simpleParser(source) for snippet/html; for large attachments, switch to bodyStructure + client.download(part) streaming instead of parsing the whole message. Keep getMailboxLock scoped tightly around fetch bursts with release() in finally.
7. For OAuth accounts, inject a fresh access token at connect time and handle the exported AuthenticationFailure by refreshing and reconnecting — imapflow does no token refresh.
8. Keep logger:false (or wire emitLogs+the `log` event into structured logging) to avoid pino noise in production.

## Citations
- [imapflow — npm (version 1.4.6)](https://www.npmjs.com/package/imapflow)
- [postalsys/imapflow — GitHub repository (README, examples)](https://github.com/postalsys/imapflow)
- [ImapFlow — official docs home](https://imapflow.com/)
- [ImapFlow Client API reference (constructor options, methods, events)](https://imapflow.com/docs/api/imapflow-client)
- [ImapFlow bundled TypeScript definitions (lib/imap-flow.d.ts, v1.4.6, installed & inspected)](https://github.com/postalsys/imapflow/blob/master/lib/imap-flow.d.ts)
- [ImapFlow CHANGELOG (1.4.x history)](https://github.com/postalsys/imapflow/blob/master/CHANGELOG.md)
- [mailparser (simpleParser) — Nodemailer docs](https://nodemailer.com/extras/mailparser/)
- [mailparser — npm (version 3.9.14)](https://www.npmjs.com/package/mailparser)
- [imapflow issue #224 — Gmail XOAUTH2 authentication example/troubleshooting](https://github.com/postalsys/imapflow/issues/224)
- [Authenticate an IMAP/POP/SMTP connection using OAuth — Microsoft Learn](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth)
