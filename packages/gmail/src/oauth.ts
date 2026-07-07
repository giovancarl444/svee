import { getEnv } from '@cortex/config';
import { google } from 'googleapis';

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

// Read-only (Constraint §6). gmail.readonly is the minimum scope for bodies.
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

/**
 * Build the OAuth client. `redirectOverride` lets the loopback auto-capture flow
 * supply a `http://127.0.0.1:<port>` redirect at runtime — so a Google "Desktop
 * app" client works with no pre-registered redirect URI. Falls back to
 * GMAIL_REDIRECT_URI (the manual/Web-client path). The redirect is only used by
 * the one-time consent exchange; refresh-token use (authedClient) doesn't need it.
 */
export function makeOAuthClient(redirectOverride?: string): OAuth2Client {
  const env = getEnv();
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET) {
    throw new Error('Gmail OAuth is not configured: set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET.');
  }
  const redirect = redirectOverride ?? env.GMAIL_REDIRECT_URI;
  return new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET, redirect);
}

/** URL the operator visits once to grant read access (scopes default to Gmail). */
export function authUrl(client: OAuth2Client, scopes: string[] = GMAIL_SCOPES): string {
  return client.generateAuthUrl({
    access_type: 'offline', // returns a refresh_token
    prompt: 'consent', // force refresh_token even on re-consent
    scope: scopes,
  });
}

/** Exchange the consent code for a durable refresh token. */
export async function exchangeCode(client: OAuth2Client, code: string): Promise<string> {
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh_token returned. Revoke prior access and re-consent with prompt=consent, access_type=offline.',
    );
  }
  return tokens.refresh_token;
}

/** An authenticated client that auto-refreshes the ~1h access token. */
export function authedClient(refreshToken: string): OAuth2Client {
  const client = makeOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
