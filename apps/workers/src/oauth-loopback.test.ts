import { describe, expect, it } from 'vitest';
import { captureAuthCode } from './oauth-loopback';

describe('captureAuthCode (loopback OAuth capture — the operator pastes nothing)', () => {
  it('captures the code from the browser redirect and reuses the exact redirect URI', async () => {
    let redirect = '';
    const res = await captureAuthCode({
      buildAuthUrl: (r) => {
        redirect = r;
        return `https://accounts.example/auth?redirect_uri=${encodeURIComponent(r)}`;
      },
      // Stand in for the browser: after "consent", hit the loopback with a code.
      openBrowser: () => {
        void fetch(`${redirect}?code=abc123&scope=readonly`).catch(() => {});
      },
    });
    expect(res.code).toBe('abc123');
    expect(res.redirectUri).toBe(redirect);
    expect(res.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth2\/callback$/);
  });

  it('rejects when the provider redirects with an error instead of a code', async () => {
    let redirect = '';
    await expect(
      captureAuthCode({
        buildAuthUrl: (r) => {
          redirect = r;
          return 'https://accounts.example/auth';
        },
        openBrowser: () => {
          void fetch(`${redirect}?error=access_denied`).catch(() => {});
        },
      }),
    ).rejects.toThrow(/access_denied/);
  });

  it('times out (does not hang) when no redirect ever arrives', async () => {
    await expect(
      captureAuthCode({ buildAuthUrl: () => 'https://accounts.example/auth', openBrowser: () => {}, timeoutMs: 150 }),
    ).rejects.toThrow(/timed out/);
  });
});
