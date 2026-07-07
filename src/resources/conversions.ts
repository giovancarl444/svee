/**
 * Conversion / action WRITES (server-to-server).
 *
 * Safety model (§3.6, §3.9):
 *   - Dry-run is the DEFAULT. Without `--live` (or IMPACT_LIVE=1) we log the
 *     exact request we WOULD send and return it — nothing hits the network.
 *   - Idempotent by construction: our OrderId is the dedupe key, so a retry can
 *     never double-count a sale. We also derive an Idempotency-Key header.
 *   - GDPR: customer email is hashed before it ever leaves this process; the raw
 *     value is never sent, logged, or stored.
 *
 * Supports both order-level and item-level templates.
 *
 * VERIFY (docs egress blocked): the submit path and the exact form field names
 * (esp. item-level indexing and the hashed-email field) against the Conversions
 * reference before firing live. Wrong field names are silently dropped.
 */
import type { ImpactContext } from "../client/context.js";
import { hashEmail } from "../util/hash.js";
import { hashValue } from "../util/hash.js";
import { toImpactDateTime } from "../util/date.js";

export interface ConversionItem {
  sku: string;
  name?: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  /** Optional per-item action tracker override. */
  subTotal?: number;
}

export interface BaseConversion {
  /** OUR order id — the idempotency/dedupe key. Required. */
  orderId: string;
  campaignId: string;
  actionTrackerId: string;
  /** The click that drove the sale (impact ClickId), when known. */
  clickId?: string;
  currencyCode?: string;
  eventDate?: Date;
  /** Raw customer email — hashed before send, never transmitted/stored raw. */
  customerEmail?: string;
  /** Free-form passthrough params (SubId1..3, custom fields). VERIFY names. */
  extra?: Record<string, string | number | undefined>;
}

export interface OrderLevelConversion extends BaseConversion {
  /** Order total. */
  amount: number;
}

export interface ItemLevelConversion extends BaseConversion {
  items: ConversionItem[];
  /** If omitted, computed as sum(item.subTotal ?? quantity*unitPrice). */
  amount?: number;
}

export interface ConversionRequest {
  method: "POST";
  path: string;
  /** Redacted form for logging (no raw PII). */
  form: Record<string, string>;
  idempotencyKey: string;
}

export interface ConversionResult {
  dryRun: boolean;
  idempotencyKey: string;
  request: ConversionRequest;
  /** Present only on a live send. */
  response?: { status: number; body: unknown };
}

export class ConversionsResource {
  constructor(private readonly ctx: ImpactContext) {}

  /** Submit an order-level conversion. */
  submitOrder(conv: OrderLevelConversion): Promise<ConversionResult> {
    const form = this.baseForm(conv);
    form.Amount = money(conv.amount);
    return this.dispatch(conv.orderId, conv.actionTrackerId, form);
  }

  /** Submit an item-level conversion (line items expanded to indexed params). */
  submitItems(conv: ItemLevelConversion): Promise<ConversionResult> {
    const form = this.baseForm(conv);
    const computed = conv.items.reduce((sum, it) => sum + (it.subTotal ?? it.quantity * it.unitPrice), 0);
    form.Amount = money(conv.amount ?? computed);
    // Item-level indexing: ItemSku1, ItemName1, ... VERIFY the exact scheme.
    conv.items.forEach((it, i) => {
      const n = i + 1;
      form[`ItemSku${n}`] = it.sku;
      if (it.name) form[`ItemName${n}`] = it.name;
      if (it.category) form[`ItemCategory${n}`] = it.category;
      form[`ItemQuantity${n}`] = String(it.quantity);
      form[`ItemSubTotal${n}`] = money(it.subTotal ?? it.quantity * it.unitPrice);
    });
    return this.dispatch(conv.orderId, conv.actionTrackerId, form);
  }

  /** Shared form fields for any conversion. */
  private baseForm(conv: BaseConversion): Record<string, string> {
    const form: Record<string, string> = {
      CampaignId: conv.campaignId,
      ActionTrackerId: conv.actionTrackerId,
      OrderId: conv.orderId, // idempotency / dedupe key
      CurrencyCode: conv.currencyCode ?? this.ctx.config.defaultCurrency,
      EventDate: toImpactDateTime(conv.eventDate ?? new Date()),
    };
    if (conv.clickId) form.ClickId = conv.clickId;
    if (conv.customerEmail) {
      // Hash before send; raw email never leaves this function. VERIFY field name.
      form.CustomerEmailHashed = hashEmail(conv.customerEmail);
    }
    for (const [k, v] of Object.entries(conv.extra ?? {})) {
      if (v !== undefined) form[k] = String(v);
    }
    return form;
  }

  private async dispatch(
    orderId: string,
    actionTrackerId: string,
    form: Record<string, string>,
  ): Promise<ConversionResult> {
    const path = this.ctx.path("Conversions");
    // Stable, order-independent idempotency key from the natural keys.
    const idempotencyKey = hashValue(`${this.ctx.config.accountSid}:${actionTrackerId}:${orderId}`);
    const request: ConversionRequest = { method: "POST", path, form: redactForm(form), idempotencyKey };

    if (!this.ctx.config.live) {
      this.ctx.logger.info("conversion DRY-RUN (not sent)", { path, idempotencyKey, form: request.form });
      return { dryRun: true, idempotencyKey, request };
    }

    this.ctx.logger.info("conversion LIVE submit", { path, idempotencyKey, orderId });
    const res = await this.ctx.http.post<unknown>(path, { form, idempotencyKey });
    return { dryRun: false, idempotencyKey, request, response: { status: res.status, body: res.data } };
  }
}

/** Format money to 2 dp as impact.com expects a decimal string. */
function money(n: number): string {
  return n.toFixed(2);
}

/** Redact PII-adjacent values from a form for logging. */
function redactForm(form: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(form)) {
    out[k] = /email|hash|token/i.test(k) ? `****${v.slice(-4)}` : v;
  }
  return out;
}
