import { loadLocalEnv } from '@cortex/config';

loadLocalEnv();

import { createInterface } from 'node:readline/promises';
import { getEnv } from '@cortex/config';
import { exchangeMicrosoftCode, microsoftAuthUrl } from '@cortex/imap';

/**
 * One-time Microsoft consent for Outlook.com / Microsoft 365 over IMAP. Run
 * `pnpm outlook:auth`, approve read-only IMAP access, paste back the `code` from
 * the redirect URL, and copy the printed refresh token into `.env` as
 * OUTLOOK_REFRESH_TOKEN (Constraint §3 — the token lives in env, not the repo).
 *
 * Prereq: an Azure "App registration" (portal.azure.com) with
 *   - Supported account types including personal Microsoft accounts,
 *   - a Web redirect URI matching OUTLOOK_REDIRECT_URI,
 *   - (optional) a client secret if you registered a confidential client.
 */
async function main(): Promise<void> {
  const env = getEnv();
  const clientId = env.OUTLOOK_CLIENT_ID;
  const redirectUri = env.OUTLOOK_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error('Set OUTLOOK_CLIENT_ID and OUTLOOK_REDIRECT_URI in .env before running outlook:auth.');
  }

  const url = microsoftAuthUrl({ clientId, redirectUri, tenant: env.OUTLOOK_TENANT });

  console.log('\n1) Open this URL, sign in with your Outlook account, and approve read-only IMAP access:\n');
  console.log(`   ${url}\n`);
  console.log('2) Microsoft redirects to your OUTLOOK_REDIRECT_URI with ?code=... — paste that code:\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const code = (await rl.question('   code: ')).trim();
  rl.close();

  const refreshToken = await exchangeMicrosoftCode({
    clientId,
    ...(env.OUTLOOK_CLIENT_SECRET ? { clientSecret: env.OUTLOOK_CLIENT_SECRET } : {}),
    redirectUri,
    tenant: env.OUTLOOK_TENANT,
    code,
  });

  console.log('\n✓ Add these to your .env (keep the token secret):\n');
  console.log(`OUTLOOK_REFRESH_TOKEN=${refreshToken}`);
  console.log('OUTLOOK_USER=your-address@outlook.com\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
