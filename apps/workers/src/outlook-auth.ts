import { loadLocalEnv } from '@cortex/config';

loadLocalEnv();

import { createInterface } from 'node:readline/promises';
import { getEnv } from '@cortex/config';
import { exchangeMicrosoftCode, microsoftAuthUrl } from '@cortex/imap';
import { setEnvVar } from './env-file';
import { captureAuthCode } from './oauth-loopback';

/**
 * One-time Microsoft consent for Outlook.com / Microsoft 365 over IMAP (read-only).
 *
 *   pnpm --filter @cortex/workers outlook:auth            # loopback auto-capture (default)
 *   pnpm --filter @cortex/workers outlook:auth --manual   # paste-the-code fallback
 *
 * Register an Azure "App registration" that INCLUDES personal Microsoft accounts.
 * For the default loopback flow, add a "Mobile and desktop applications" platform
 * (public client) with an `http://localhost` redirect; for --manual, add a "Web"
 * redirect matching OUTLOOK_REDIRECT_URI. Only IMAP.AccessAsUser.All +
 * offline_access are requested — never a send scope.
 */
async function main(): Promise<void> {
  const env = getEnv();
  const clientId = env.OUTLOOK_CLIENT_ID;
  if (!clientId) throw new Error('Set OUTLOOK_CLIENT_ID in .env before running outlook:auth.');
  const clientSecret = env.OUTLOOK_CLIENT_SECRET ? { clientSecret: env.OUTLOOK_CLIENT_SECRET } : {};
  const manual = process.argv.includes('--manual');

  let refreshToken: string;
  if (manual) {
    const redirectUri = env.OUTLOOK_REDIRECT_URI;
    if (!redirectUri) throw new Error('Set OUTLOOK_REDIRECT_URI for --manual (or drop it to use loopback).');
    const url = microsoftAuthUrl({ clientId, redirectUri, tenant: env.OUTLOOK_TENANT });
    console.log(`\n1) Open, sign in, approve read-only IMAP:\n   ${url}\n2) Paste the ?code=... from the redirect:\n`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const code = (await rl.question('   code: ')).trim();
    rl.close();
    refreshToken = await exchangeMicrosoftCode({ clientId, ...clientSecret, redirectUri, tenant: env.OUTLOOK_TENANT, code });
  } else {
    console.log('\nOpening your browser for read-only Outlook (IMAP) consent…');
    console.log('Approve there — CORTEX captures the code automatically (you paste nothing).\n');
    const { code, redirectUri } = await captureAuthCode({
      host: 'localhost', // Microsoft loopback expects the localhost host
      buildAuthUrl: (redir) => microsoftAuthUrl({ clientId, redirectUri: redir, tenant: env.OUTLOOK_TENANT }),
      onReady: (url) => console.log(`If the browser didn't open, visit:\n  ${url}\n`),
    });
    refreshToken = await exchangeMicrosoftCode({ clientId, ...clientSecret, redirectUri, tenant: env.OUTLOOK_TENANT, code });
  }

  setEnvVar('OUTLOOK_REFRESH_TOKEN', refreshToken); // written to .env, never printed

  // The mailbox address is needed for IMAP login (not a secret). Ask once if unset.
  if (!env.OUTLOOK_USER) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const user = (await rl.question('\nYour Outlook email address (for IMAP login): ')).trim();
    rl.close();
    if (user) setEnvVar('OUTLOOK_USER', user);
  }

  console.log('\n✓ OUTLOOK_REFRESH_TOKEN written to .env (value not shown).');
  console.log('  Next: pnpm --filter @cortex/workers doctor\n');
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
