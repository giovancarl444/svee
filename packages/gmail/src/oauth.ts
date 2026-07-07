import { getEnv } from '@cortex/config';
import { google } from 'googleapis';

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

// Read-only (Constraint §6). gmail.readonly is the minimum scope for bodies.
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function requireOAuthEnv() {
  const env = getEnv();
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REDIRECT_URI) {
    throw new Error(
      'Gmail OAuth is not configured: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI.',
    );
  }
  return env;
}

export function makeOAuthClient(): OAuth2Client {
  const env = requireOAuthEnv();
  return new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET, env.GMAIL_REDIRECT_URI);
}

/** URL the operator visits once to grant read access. */
export function authUrl(client: OAuth2Client): string {
  return client.generateAuthUrl({
    access_type: 'offline', // returns a refresh_token
    prompt: 'consent', // force refresh_token even on re-consent
    scope: GMAIL_SCOPES,
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
