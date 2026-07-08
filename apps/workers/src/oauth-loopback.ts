import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

/**
 * Local loopback capture for the one-time OAuth consent — so the operator NEVER
 * copy-pastes a redirect `code`. We stand up a tiny `http://127.0.0.1:<port>`
 * server, open the consent URL in their real (already-signed-in) browser, and
 * when Google/Microsoft redirects back after they click "Allow" we read the
 * `code` off the query string automatically. Read-only and fully in-scope: we
 * never see their password/2FA — only the post-consent authorization code, which
 * is exchanged for a refresh token and written to `.env`.
 *
 * A Google "Desktop app" client special-cases loopback redirects, so no exact
 * redirect URI needs pre-registering; Microsoft public/desktop clients allow
 * `http://localhost` loopback the same way.
 */

/** Open a URL in the operator's default browser (macOS/Linux/Windows). Best-effort. */
export function openInBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* the URL is printed too, so a failure to auto-open is non-fatal */
  }
}

export interface LoopbackOptions {
  /** Build the provider consent URL for the given loopback redirect URI. */
  buildAuthUrl: (redirectUri: string) => string;
  host?: string; // default 127.0.0.1
  port?: number; // default 0 = an OS-assigned free port (recommended for Desktop clients)
  path?: string; // default /oauth2/callback
  timeoutMs?: number; // default 5 min
  /** Injectable for tests; defaults to opening the real browser. */
  openBrowser?: (url: string) => void;
  /** Called with the consent URL once the listener is up (for a printed fallback). */
  onReady?: (url: string) => void;
}

export interface LoopbackResult {
  code: string;
  redirectUri: string;
}

function resultPage(ok: boolean, detail: string): string {
  return `<!doctype html><meta charset="utf-8"><title>CORTEX</title>
<body style="font:16px system-ui;margin:16vh auto;max-width:420px;text-align:center;color:#1a1a18">
<h2>${ok ? '✓ Connected to CORTEX' : '⚠ Consent failed'}</h2>
<p style="color:#6b6a63">${detail}</p>
<p style="color:#6b6a63">You can close this tab and return to the terminal.</p></body>`;
}

/**
 * Run the loopback capture. Resolves with the authorization `code` and the exact
 * redirect URI used (which the token exchange must reuse). Rejects on timeout or
 * an OAuth error redirect.
 */
export function captureAuthCode(opts: LoopbackOptions): Promise<LoopbackResult> {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? 0; // 0 → OS-assigned free port
  const path = opts.path ?? '/oauth2/callback';
  const open = opts.openBrowser ?? openInBrowser;
  let redirectUri = `http://${host}:${port}${path}`; // finalized once the port is bound

  return new Promise<LoopbackResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      fn();
    };

    const server = createServer((req, res) => {
      const u = new URL(req.url ?? '/', redirectUri);
      if (u.pathname !== path) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      const code = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      res.writeHead(code ? 200 : 400, { 'content-type': 'text/html' });
      res.end(resultPage(Boolean(code), code ? 'Access granted (read-only).' : `Provider returned: ${error ?? 'no code'}`));
      if (code) finish(() => resolve({ code, redirectUri }));
      else finish(() => reject(new Error(`OAuth redirect returned no code${error ? ` (${error})` : ''}`)));
    });

    const timer = setTimeout(
      () => finish(() => reject(new Error('timed out waiting for the browser redirect (5 min)'))),
      opts.timeoutMs ?? 300_000,
    );

    server.on('error', (err) => finish(() => reject(err)));
    server.listen(port, host, () => {
      const addr = server.address();
      const boundPort = typeof addr === 'object' && addr ? addr.port : port;
      redirectUri = `http://${host}:${boundPort}${path}`;
      const url = opts.buildAuthUrl(redirectUri);
      opts.onReady?.(url);
      open(url);
    });
  });
}
