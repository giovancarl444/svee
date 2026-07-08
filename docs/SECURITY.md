# CORTEX — Security posture

CORTEX is a window into the operator's entire life. It is designed to be seizable
without catastrophe and auditable at any time.

## Encryption at rest (Constraint §5)

- **Column-level.** `items.body_text` and `items.body_snippet` are AES-256-GCM
  encrypted via a Drizzle custom type ([`encrypted.ts`](../packages/db/src/encrypted.ts)
  → [`crypto.ts`](../packages/db/src/crypto.ts)). There is no code path that
  writes a body column in plaintext — it's structural, not a convention.
- **Authenticated.** GCM detects tampering; a flipped ciphertext byte fails to
  decrypt (tested).
- **Key custody.** `CORTEX_ENCRYPTION_KEY` (32 bytes, base64) lives in env / a
  secret store, **never in the DB**. A stolen disk alone yields no plaintext.
- **Defense in depth.** Also put the Postgres volume on an encrypted disk
  (LUKS/dm-crypt) — noted in `docker-compose.yml`.

## Secrets (Constraint §3)

- All secrets are server-side only, in `.env` / a secret store. `.env` is
  gitignored; only `.env.example` (no values) is committed.
- No `NEXT_PUBLIC_*` secret exists. `@cortex/config` throws if imported into a
  client bundle, and the dashboard reads env only in Server Components.

## Data minimization & the audit trail (Constraints §2, §10)

- The [redaction/allowlist layer](../packages/ai/src/redaction.ts) is the sole
  constructor of model payloads. Only the allowlisted fields leave the box; full
  bodies and raw chains never do. Snippets are length-capped.
- Every Claude call appends a row to `api_calls` with the **exact** payload sent
  (`input_summary`), the model, token usage, and cost estimate. "What did CORTEX
  send to Anthropic about item X?" is answerable via `api_calls.related_item_id`.
  The Connectors view renders this log ("what left the box").

## Network egress (Constraint §4)

The only outbound calls are: the ingested source APIs, the WhatsApp module, and
the Anthropic API. No analytics, no telemetry, no third-party fonts/CDN —
**fonts are vendored locally** and images are not remotely optimized.

## Access control (Constraint §10)

- The stack binds to `127.0.0.1`. It must sit behind a VPN (Tailscale) or an
  authenticating reverse proxy (Caddy + TLS). **Never expose it unauthenticated.**
- Until app-level auth is enabled, the dashboard shows a persistent **UNSECURED**
  banner whenever `CORTEX_AUTH_SECRET` is unset — a visible reminder, not silent
  acceptance.
- **Phase 1 work item:** app-level single-operator login (session cookie signed
  with `CORTEX_AUTH_SECRET`, credentials from `CORTEX_OPERATOR_*`) landing
  alongside the first real data. The env contract and the banner are already in
  place.

## Supply-chain hygiene (Constraint §7, spec §10)

- Exact-pinned versions (`.npmrc` `save-exact`) and a committed lockfile.
  CI installs with `--frozen-lockfile`.
- pnpm build scripts are blocked except an explicit allowlist
  (`package.json#pnpm.onlyBuiltDependencies`).
- **WhatsApp (Phase 4):** canonical repos only (`WhiskeySockets/Baileys`,
  `mautrix/whatsapp` / `tulir/whatsmeow`); pin exact versions; audit transitive
  deps; treat any "undetectable"-anything package as malware (cf. the malicious
  `lotusbail` Baileys fork). Read-only, in its own killable container. See
  [`docs/live-docs/whatsapp.md`](live-docs/whatsapp.md).

## Read-only by default (Constraint §6)

V1 observes and advises only. No send capability exists in the codebase. Any
act-on-your-behalf feature is a separate, explicitly-gated future decision.
