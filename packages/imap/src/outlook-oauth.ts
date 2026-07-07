/**
 * Microsoft (Outlook.com / Microsoft 365) OAuth for IMAP.
 *
 * Why this exists: as of Microsoft's 2026 basic-auth cutoff, IMAP/POP/SMTP no
 * longer accept passwords or app passwords — only OAuth 2.0 (XOAUTH2). The IMAP
 * *protocol* is untouched, so the generic `ImapAdapter` still ingests an Outlook
 * mailbox; it just needs a bearer token instead of a password. This module mints
 * and refreshes that token. It is READ-ONLY: the only scope requested is
 * IMAP.AccessAsUser.All + offline_access. No send scope is ever requested.
 *
 * Verified against Microsoft Learn (2026-07): token endpoint
 * login.microsoftonline.com/{tenant}/oauth2/v2.0/token, IMAP host
 * outlook.office365.com:993.
 */

export const OUTLOOK_IMAP_HOST = 'outlook.office365.com';
export const OUTLOOK_IMAP_PORT = 993;

/** Read-only IMAP + a refresh token. Deliberately NO Mail.Send / SMTP scope. */
export const OUTLOOK_SCOPES = [
  'offline_access',
  'https://outlook.office.com/IMAP.AccessAsUser.All',
] as const;

/** 'common' works for personal + work accounts; 'consumers' is personal-only. */
const DEFAULT_TENANT = 'common';

function tokenEndpoint(tenant: string): string {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

async function postToken(tenant: string, form: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(tokenEndpoint(tenant), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Microsoft token endpoint returned ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

export interface MicrosoftOAuthConfig {
  clientId: string;
  /** Optional — omit for a public (PKCE-style) app registration. */
  clientSecret?: string;
  refreshToken: string;
  tenant?: string;
}

/**
 * A token getter suitable for `ImapConfig.accessToken`. Caches the access token
 * in memory and refreshes it ~1 minute before expiry, so each IMAP connect uses
 * a live token without a network round-trip every time.
 */
export function makeMicrosoftTokenProvider(cfg: MicrosoftOAuthConfig): () => Promise<string> {
  const tenant = cfg.tenant ?? DEFAULT_TENANT;
  let cached: { token: string; expiresAt: number } | null = null;

  return async () => {
    if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
    const json = await postToken(tenant, {
      client_id: cfg.clientId,
      grant_type: 'refresh_token',
      refresh_token: cfg.refreshToken,
      scope: OUTLOOK_SCOPES.join(' '),
      ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}),
    });
    cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  };
}

/** The consent URL for the one-time `outlook:auth` flow. */
export function microsoftAuthUrl(cfg: {
  clientId: string;
  redirectUri: string;
  tenant?: string;
}): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: cfg.redirectUri,
    response_mode: 'query',
    scope: OUTLOOK_SCOPES.join(' '),
    prompt: 'consent',
  });
  return `https://login.microsoftonline.com/${cfg.tenant ?? DEFAULT_TENANT}/oauth2/v2.0/authorize?${params}`;
}

/** Exchange the consent `code` for a long-lived refresh token. */
export async function exchangeMicrosoftCode(cfg: {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  tenant?: string;
  code: string;
}): Promise<string> {
  const json = await postToken(cfg.tenant ?? DEFAULT_TENANT, {
    client_id: cfg.clientId,
    grant_type: 'authorization_code',
    code: cfg.code,
    redirect_uri: cfg.redirectUri,
    scope: OUTLOOK_SCOPES.join(' '),
    ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}),
  });
  if (!json.refresh_token) {
    throw new Error('Microsoft did not return a refresh_token — ensure `offline_access` is granted.');
  }
  return json.refresh_token;
}
