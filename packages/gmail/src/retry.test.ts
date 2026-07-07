import { describe, expect, it } from 'vitest';
import { isRetryable, withRetry } from './gmail-api';

const err = (code: number, reason?: string) =>
  Object.assign(new Error(`http ${code}`), { code, ...(reason ? { errors: [{ reason }] } : {}) });

describe('isRetryable', () => {
  it('retries 429 and 5xx', () => {
    expect(isRetryable(err(429))).toBe(true);
    expect(isRetryable(err(503))).toBe(true);
  });
  it('retries 403 only when it is a rate limit', () => {
    expect(isRetryable(err(403, 'rateLimitExceeded'))).toBe(true);
    expect(isRetryable(err(403, 'insufficientPermissions'))).toBe(false);
  });
  it('does not retry 400/401/404', () => {
    expect(isRetryable(err(404))).toBe(false);
    expect(isRetryable(err(401))).toBe(false);
  });
});

describe('withRetry', () => {
  it('succeeds after transient rate limits', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw err(429);
        return 'ok';
      },
      { baseDelayMs: 1 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up (throws) on a non-retryable error immediately', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw err(403, 'insufficientPermissions');
        },
        { baseDelayMs: 1 },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('gives up after the attempt budget', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw err(500);
        },
        { attempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(3);
  });
});
