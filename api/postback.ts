/**
 * Vercel serverless function — impact.com postback receiver.
 * GET/POST /api/postback?token=<WEBHOOK_SIGNING_SECRET> -> verify, dedupe, upsert.
 *
 * Wraps the shared, tested handler. Uses Vercel's parsed req.query/req.body.
 * NOTE: HMAC-signature verification needs the RAW body, which Vercel's default
 * body parser discards — the shared-secret TOKEN path (our default) works as-is.
 * For HMAC, disable the body parser and pass the raw string.
 *
 * Imports the compiled library from ../dist (Vercel builds first).
 */
import { loadConfig } from "../dist/client/config.js";
import { createDatabase } from "../dist/sync/db.js";
import { createLogger } from "../dist/client/logger.js";
import { handlePostback } from "../dist/webhooks/handler.js";

export default async function handler(req: any, res: any): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { comp: "webhook-vercel" });
  const db = createDatabase(config);
  try {
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query ?? {})) query[k] = Array.isArray(v) ? String(v[0]) : String(v);

    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers ?? {})) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : (v as string);

    // Reconstruct a raw-ish body from Vercel's parsed body for parseParams.
    let rawBody = "";
    if (typeof req.body === "string") rawBody = req.body;
    else if (req.body && typeof req.body === "object") rawBody = new URLSearchParams(req.body as Record<string, string>).toString();

    const result = await handlePostback({ method: req.method ?? "GET", rawBody, headers, query }, { db, config, logger });
    res.status(result.status).json(result.body);
  } catch (err) {
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  } finally {
    await db.close();
  }
}
