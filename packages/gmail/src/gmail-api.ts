import { google, type gmail_v1 } from 'googleapis';

/**
 * A narrow facade over the exact Gmail endpoints CORTEX uses. Keeping it small
 * means the adapter can be driven by an in-memory fake in tests without touching
 * the network or the full `googleapis` surface.
 */
export interface GmailApi {
  getProfile(): Promise<gmail_v1.Schema$Profile>;
  listMessageIds(params: {
    q?: string;
    pageToken?: string;
    maxResults?: number;
    labelIds?: string[];
  }): Promise<gmail_v1.Schema$ListMessagesResponse>;
  getMessage(id: string): Promise<gmail_v1.Schema$Message>;
  listHistory(params: {
    startHistoryId: string;
    pageToken?: string;
    historyTypes?: string[];
  }): Promise<gmail_v1.Schema$ListHistoryResponse>;
}

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

/** The real facade, backed by the official googleapis client. */
export function makeGmailApi(auth: OAuth2Client): GmailApi {
  const gmail = google.gmail({ version: 'v1', auth });
  return {
    async getProfile() {
      return withRetry(async () => (await gmail.users.getProfile({ userId: 'me' })).data);
    },
    async listMessageIds(p) {
      return withRetry(
        async () =>
          (
            await gmail.users.messages.list({
              userId: 'me',
              q: p.q,
              maxResults: p.maxResults ?? 500,
              pageToken: p.pageToken,
              labelIds: p.labelIds,
            })
          ).data,
      );
    },
    async getMessage(id) {
      return withRetry(
        async () => (await gmail.users.messages.get({ userId: 'me', id, format: 'full' })).data,
      );
    },
    async listHistory(p) {
      return withRetry(
        async () =>
          (
            await gmail.users.history.list({
              userId: 'me',
              startHistoryId: p.startHistoryId,
              pageToken: p.pageToken,
              historyTypes: p.historyTypes,
            })
          ).data,
      );
    },
  };
}

/** history.list returns 404 when the stored historyId is too old → full resync. */
export function isNotFound(err: unknown): boolean {
  const e = err as { code?: number; status?: number; response?: { status?: number } };
  return e?.code === 404 || e?.status === 404 || e?.response?.status === 404;
}

function statusOf(err: unknown): number {
  const e = err as { code?: number; status?: number; response?: { status?: number } };
  return e?.code ?? e?.status ?? e?.response?.status ?? 0;
}

/** Retry on rate limits (429, or 403 rateLimitExceeded) and 5xx — the caps the live-docs flag. */
export function isRetryable(err: unknown): boolean {
  const s = statusOf(err);
  if (s === 429) return true;
  if (s >= 500 && s < 600) return true;
  if (s === 403) {
    const reason = String(
      (err as { errors?: Array<{ reason?: string }> })?.errors?.[0]?.reason ?? '',
    ).toLowerCase();
    return reason.includes('ratelimit');
  }
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isRetryable(err)) throw err;
      // exponential backoff with jitter (bounded ~30s)
      const backoff = Math.min(30_000, baseDelayMs * 2 ** i) + Math.floor(Math.random() * 250);
      await sleep(backoff);
    }
  }
  throw lastErr;
}
