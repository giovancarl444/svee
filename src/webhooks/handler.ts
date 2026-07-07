/**
 * Framework-agnostic postback handler. Verify → dedupe on event id → upsert the
 * action → log. Wired to a plain Node server (server.ts) and shown as a Next.js
 * route (next-route.ts). Pure enough to unit-test with a fake DB.
 */
import type { Database } from "../sync/db.js";
import type { ImpactConfig } from "../client/config.js";
import type { Logger } from "../client/logger.js";
import { verifyPostback } from "./verify.js";
import { actionToRow } from "../sync/mappers.js";
import { firstOf } from "../util/coerce.js";
import { hashValue, hashEmail } from "../util/hash.js";
import type { Action } from "../types/impact.js";

/** Param keys that must NEVER be persisted (auth material). */
const SECRET_PARAM = /^(token|secret|signature|sig|auth|password|apikey|api_key)$/i;

/**
 * Strip auth material (the shared-secret token, signatures) and hash any
 * PII-adjacent value BEFORE anything is persisted. The token param is our own
 * auth secret — storing it next to the data it protects would let anyone with
 * read access forge postbacks. Emails are hashed at ingest (GDPR §3.7).
 */
export function sanitizePostbackParams(params: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (SECRET_PARAM.test(k)) continue;
    out[k] = /email/i.test(k) ? hashEmail(v) : v;
  }
  return out;
}

export interface PostbackRequest {
  method: string;
  rawBody: string;
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
}

export interface PostbackDeps {
  db: Database;
  config: ImpactConfig;
  logger: Logger;
  /** Allow processing without a valid secret (DEV ONLY). Default false. */
  allowInsecure?: boolean;
}

export interface PostbackResponse {
  status: number;
  body: Record<string, unknown>;
}

/** Merge query + parsed body into one flat param map. */
export function parseParams(req: PostbackRequest): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) if (v != null) params[k] = v;
  const ct = (req.headers["content-type"] ?? "").toLowerCase();
  if (req.rawBody) {
    if (ct.includes("application/json")) {
      try {
        const obj = JSON.parse(req.rawBody) as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) if (v != null) params[k] = String(v);
      } catch {
        /* ignore malformed json body */
      }
    } else {
      for (const [k, v] of new URLSearchParams(req.rawBody)) params[k] = v;
    }
  }
  return params;
}

/** Map postback macro params to an Action for the standard upsert path. */
export function postbackToAction(params: Record<string, string>): Action {
  return {
    Id: firstOf(params, ["ActionId", "Id", "Oid", "EventId"]) ?? undefined,
    CampaignId: firstOf(params, ["CampaignId"]) ?? undefined,
    ActionTrackerId: firstOf(params, ["ActionTrackerId"]) ?? undefined,
    MediaId: firstOf(params, ["MediaId", "MediaPartnerId"]) ?? undefined,
    State: firstOf(params, ["State", "Status", "ActionStatus"]) ?? undefined,
    Amount: firstOf(params, ["Amount", "SaleAmount"]) ?? undefined,
    Payout: firstOf(params, ["Payout"]) ?? undefined,
    Currency: firstOf(params, ["Currency", "CurrencyCode"]) ?? undefined,
    OrderId: firstOf(params, ["OrderId"]) ?? undefined,
    Oid: firstOf(params, ["Oid"]) ?? undefined,
    EventDate: firstOf(params, ["EventDate", "ActionDate"]) ?? undefined,
    ...params,
  };
}

export async function handlePostback(req: PostbackRequest, deps: PostbackDeps): Promise<PostbackResponse> {
  const { db, config, logger } = deps;
  const params = parseParams(req);
  const token = params.token ?? req.headers["x-impact-token"];

  const verify = verifyPostback({
    rawBody: req.rawBody,
    headers: req.headers,
    providedToken: token,
    secret: config.webhook.signingSecret,
  });

  if (!verify.ok && !deps.allowInsecure) {
    logger.warn("postback rejected", { reason: verify.reason, method: verify.method });
    return { status: 401, body: { error: "unauthorized", reason: verify.reason } };
  }

  const safe = sanitizePostbackParams(params);
  const eventId = firstOf(safe, ["EventId", "ActionId", "Id", "Oid", "SnapshotId"]) ?? hashValue(JSON.stringify(safe));
  const eventType = firstOf(safe, ["EventType", "ActionStatus", "State"]) ?? "action";

  // DB=none: acknowledge but don't persist (useful for local echo testing).
  if (config.db.driver === "none") {
    logger.info("postback accepted (not persisted: DB=none)", { eventId, eventType, verified: verify.ok });
    return { status: 200, body: { ok: true, eventId, persisted: false } };
  }

  // Upsert the action FIRST — it is idempotent on the natural key, so doing it
  // before the dedupe/audit write makes the whole handler crash-safe: if we die
  // between the two, redelivery simply re-upserts (no double count) and then
  // records the audit row. Recording the audit row first would let a failed
  // upsert + redelivery silently drop the action forever.
  const row = actionToRow(postbackToAction(safe));
  if (row) {
    await db.upsert("actions", [row], ["id"]);
  }

  // Record the (sanitized) event for audit + dedupe. Never store the raw token.
  const inserted = await db.query<{ event_id: string }>(
    `INSERT INTO webhook_events (event_id, event_type, signature_ok, payload)
     VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [eventId, eventType, verify.ok, JSON.stringify(safe)],
  );
  const duplicate = inserted.length === 0;
  logger.info(duplicate ? "postback duplicate (action re-upserted idempotently)" : "postback processed", {
    eventId,
    actionId: row?.id,
    duplicate,
  });
  return { status: 200, body: { ok: true, eventId, duplicate } };
}
