import { loadLocalEnv } from '@cortex/config';

loadLocalEnv();

import { createInterface } from 'node:readline/promises';
import { GMAIL_SCOPES, authUrl, exchangeCode, makeOAuthClient } from '@cortex/gmail';
import { setEnvVar } from './env-file';
import { captureAuthCode } from './oauth-loopback';

// One consent covers both Gmail and Calendar (read-only), so the same refresh
// token drives both adapters.
const SCOPES = [...GMAIL_SCOPES, 'https://www.googleapis.com/auth/calendar.readonly'];

/**
 * One-time Google consent for read-only Gmail + Calendar.
 *
 *   pnpm --filter @cortex/workers gmail:auth            # loopback auto-capture (default)
 *   pnpm --filter @cortex/workers gmail:auth --manual   # paste-the-code fallback
 *
 * Default flow: opens the operator's browser, they click "Allow", and CORTEX
 * captures the redirect `code` on a local loopback server, exchanges it, and
 * writes GMAIL_REFRESH_TOKEN into `.env` — the operator copies nothing. We never
 * see their password/2FA, only the post-consent code. Use a Google "Desktop app"
 * OAuth client so the loopback redirect needs no pre-registration.
 */
async function viaLoopback(): Promise<string> {
  console.log('\nOpening your browser for read-only Gmail + Calendar consent…');
  console.log('Approve there — CORTEX captures the code automatically (you paste nothing).\n');
  const { code, redirectUri } = await captureAuthCode({
    buildAuthUrl: (redir) => authUrl(makeOAuthClient(redir), SCOPES),
    onReady: (url) => console.log(`If the browser didn't open, visit:\n  ${url}\n`),
  });
  return exchangeCode(makeOAuthClient(redirectUri), code);
}

async function viaManualPaste(): Promise<string> {
  const client = makeOAuthClient(); // uses GMAIL_REDIRECT_URI (a "Web" client)
  const url = authUrl(client, SCOPES);
  console.log('\n1) Open this URL, sign in, and approve read-only Gmail + Calendar:\n');
  console.log(`   ${url}\n`);
  console.log('2) Google redirects to your GMAIL_REDIRECT_URI with ?code=... — paste that code:\n');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const code = (await rl.question('   code: ')).trim();
  rl.close();
  return exchangeCode(client, code);
}

async function main(): Promise<void> {
  const manual = process.argv.includes('--manual');
  const refreshToken = manual ? await viaManualPaste() : await viaLoopback();

  setEnvVar('GMAIL_REFRESH_TOKEN', refreshToken); // written to .env, never printed
  console.log('\n✓ GMAIL_REFRESH_TOKEN written to .env (value not shown).');
  console.log('  Reminder: set the OAuth consent screen to "In production", or Google expires it in 7 days.');
  console.log('  Next: pnpm --filter @cortex/workers doctor\n');
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
