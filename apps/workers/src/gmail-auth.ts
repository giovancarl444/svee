import { loadLocalEnv } from '@cortex/config';

loadLocalEnv();

import { createInterface } from 'node:readline/promises';
import { authUrl, exchangeCode, makeOAuthClient } from '@cortex/gmail';

/**
 * One-time Gmail consent. Run `pnpm gmail:auth`, approve read-only access, paste
 * back the `code` from the redirect URL, and copy the printed refresh token into
 * `.env` as GMAIL_REFRESH_TOKEN (Constraint §3 — the token lives in env, not the repo).
 */
async function main(): Promise<void> {
  const client = makeOAuthClient();
  const url = authUrl(client);

  console.log('\n1) Open this URL, sign in, and approve read-only Gmail access:\n');
  console.log(`   ${url}\n`);
  console.log('2) Google redirects to your GMAIL_REDIRECT_URI with ?code=... — paste that code:\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const code = (await rl.question('   code: ')).trim();
  rl.close();

  const refreshToken = await exchangeCode(client, code);
  console.log('\n✓ Add this to your .env (keep it secret):\n');
  console.log(`GMAIL_REFRESH_TOKEN=${refreshToken}\n`);
  console.log('Reminder: set the OAuth app to "In production", or Google expires this in 7 days.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
