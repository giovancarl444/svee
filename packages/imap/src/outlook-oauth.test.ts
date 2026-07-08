import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildImapAuth } from './imap-client';
import {
  exchangeMicrosoftCode,
  makeMicrosoftTokenProvider,
  microsoftAuthUrl,
} from './outlook-oauth';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.restoreAllMocks());

describe('microsoftAuthUrl', () => {
  it('requests read-only IMAP + offline_access and nothing else', () => {
    const url = new URL(
      microsoftAuthUrl({ clientId: 'cid', redirectUri: 'http://localhost/cb', tenant: 'common' }),
    );
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    );
    const scope = url.searchParams.get('scope') ?? '';
    expect(scope).toContain('https://outlook.office.com/IMAP.AccessAsUser.All');
    expect(scope).toContain('offline_access');
    // Read-only: never request a send/SMTP scope.
    expect(scope).not.toMatch(/SMTP|Mail\.Send/i);
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost/cb');
  });
});

describe('exchangeMicrosoftCode', () => {
  it('returns the refresh token from the token endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ access_token: 'a', expires_in: 3600, refresh_token: 'r-123' })),
    );
    const token = await exchangeMicrosoftCode({
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: 'http://localhost/cb',
      code: 'the-code',
    });
    expect(token).toBe('r-123');
  });

  it('throws a clear error if offline_access was not granted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ access_token: 'a', expires_in: 3600 })),
    );
    await expect(
      exchangeMicrosoftCode({ clientId: 'cid', redirectUri: 'http://localhost/cb', code: 'x' }),
    ).rejects.toThrow(/offline_access/);
  });
});

describe('makeMicrosoftTokenProvider', () => {
  it('caches the access token until near expiry, then refreshes', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 'live-token', expires_in: 3600, refresh_token: 'r' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const getToken = makeMicrosoftTokenProvider({ clientId: 'cid', refreshToken: 'r' });

    expect(await getToken()).toBe('live-token');
    expect(await getToken()).toBe('live-token');
    expect(fetchMock).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it('refetches when the cached token is already expiring', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 't', expires_in: 30, refresh_token: 'r' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const getToken = makeMicrosoftTokenProvider({ clientId: 'cid', refreshToken: 'r' });

    await getToken();
    await getToken();
    expect(fetchMock).toHaveBeenCalledTimes(2); // 30s TTL is inside the 60s skew, so no caching
  });

  it('surfaces a non-2xx token error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })));
    const getToken = makeMicrosoftTokenProvider({ clientId: 'cid', refreshToken: 'r' });
    await expect(getToken()).rejects.toThrow(/returned 400/);
  });
});

describe('buildImapAuth (XOAUTH2 vs password)', () => {
  it('resolves an async access-token getter into an XOAUTH2 auth block', async () => {
    const auth = await buildImapAuth({
      host: 'outlook.office365.com',
      port: 993,
      user: 'me@outlook.com',
      accessToken: async () => 'fresh-token',
    });
    expect(auth).toEqual({ user: 'me@outlook.com', accessToken: 'fresh-token' });
  });

  it('uses password auth when no token is present', async () => {
    const auth = await buildImapAuth({ host: 'h', port: 993, user: 'u', pass: 'p' });
    expect(auth).toEqual({ user: 'u', pass: 'p' });
  });

  it('throws when neither password nor token is configured', async () => {
    await expect(buildImapAuth({ host: 'h', port: 993, user: 'u' })).rejects.toThrow(
      /pass.*accessToken|accessToken.*pass/,
    );
  });
});
