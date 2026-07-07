/**
 * `npm run webhook` — a minimal, dependency-free Node HTTP server that receives
 * impact.com postbacks and routes them through the shared handler. Use this for
 * local testing / a small VM; on Vercel use next-route.ts instead.
 *
 * Enable postbacks in impact.com (UI): Settings → Postbacks/Integrations →
 * add a postback URL pointing at  https://<host>/postback?token=<secret>  and
 * select the action events to fire. VERIFY the exact UI path + available macros.
 */
import { createServer, type IncomingMessage } from "node:http";
import { loadEnvFiles } from "../util/env.js";
import { loadConfig } from "../client/config.js";
import { createDatabase } from "../sync/db.js";
import { createLogger } from "../client/logger.js";
import { handlePostback, type PostbackRequest } from "./handler.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function main() {
  loadEnvFiles();
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { comp: "webhook" });
  const db = createDatabase(config);
  const allowInsecure = process.argv.includes("--allow-insecure");
  if (allowInsecure) logger.warn("webhook running with --allow-insecure (signature checks bypassed)", {});

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (!url.pathname.endsWith("/postback")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    try {
      const rawBody = req.method === "GET" ? "" : await readBody(req);
      const query: Record<string, string> = {};
      url.searchParams.forEach((v, k) => (query[k] = v));
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
      const pbReq: PostbackRequest = { method: req.method ?? "GET", rawBody, headers, query };
      const result = await handlePostback(pbReq, { db, config, logger, allowInsecure });
      res.writeHead(result.status, { "content-type": "application/json" });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      logger.error("postback handler error", { error: (err as Error).message });
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "internal error" }));
    }
  });

  server.listen(config.webhook.port, () => {
    logger.info("webhook receiver listening", { port: config.webhook.port, path: "/postback" });
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
