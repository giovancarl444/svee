import { getEnv } from '@cortex/config';
import { dbCheckpointStore } from '@cortex/db';
import { GmailAdapter, authedClient, makeGmailApi } from '@cortex/gmail';
import { log } from './logger';
import { registerAdapter } from './registry';

/**
 * Build and register the adapters that are actually configured in env. Phase 1
 * ships Gmail; IMAP/Calendar/WhatsApp register here in later phases. A source
 * missing its credentials is simply skipped — never a hard failure.
 */
export function wireAdapters(): void {
  const env = getEnv();

  if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REDIRECT_URI && env.GMAIL_REFRESH_TOKEN) {
    const api = makeGmailApi(authedClient(env.GMAIL_REFRESH_TOKEN));
    registerAdapter(new GmailAdapter({ api, store: dbCheckpointStore }));
    log.info('adapters: gmail registered');
  } else {
    log.warn('adapters: gmail not configured (need GMAIL_CLIENT_ID/SECRET/REDIRECT_URI/REFRESH_TOKEN) — skipping');
  }
}
