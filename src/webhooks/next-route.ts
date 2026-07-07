/**
 * Example Next.js 15 App Router handler (house stack). Copy into your Next app
 * as `app/api/postback/route.ts`. Kept framework-thin: it just adapts the Web
 * Request to the shared `handlePostback` core.
 *
 * On Vercel, set env: IMPACT_*, DB/DATABASE_URL, WEBHOOK_SIGNING_SECRET. Point
 * the impact.com postback URL at  https://<app>/api/postback?token=<secret>.
 *
 * NOTE: `export const runtime = "nodejs"` — the pg driver + node:crypto need the
 * Node runtime, not Edge.
 */
import { loadConfig } from "../client/config.js";
import { createDatabase } from "../sync/db.js";
import { createLogger } from "../client/logger.js";
import { handlePostback, type PostbackRequest } from "./handler.js";

// export const runtime = "nodejs"; // uncomment inside a Next.js app

async function toPostbackRequest(request: Request): Promise<PostbackRequest> {
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (query[k] = v));
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const rawBody = request.method === "GET" ? "" : await request.text();
  return { method: request.method, rawBody, headers, query };
}

async function process(request: Request): Promise<Response> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { comp: "webhook-next" });
  const db = createDatabase(config);
  try {
    const result = await handlePostback(await toPostbackRequest(request), { db, config, logger });
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" },
    });
  } finally {
    await db.close();
  }
}

export const POST = (request: Request) => process(request);
export const GET = (request: Request) => process(request);
