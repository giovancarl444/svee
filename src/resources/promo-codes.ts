/**
 * Promo codes and exception lists. List is a plain read; create/update are
 * writes and therefore honour the dry-run/live gate.
 *
 * VERIFY the path (/{base}/PromoCodes) and the create payload field names.
 */
import type { ImpactContext } from "../client/context.js";
import { paginate, collect } from "../client/pagination.js";
import type { QueryParams } from "../client/http.js";
import { DATA_KEYS } from "./params.js";
import type { PromoCode } from "../types/impact.js";

export interface CreatePromoCode {
  code: string;
  campaignId: string;
  mediaId?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  extra?: Record<string, string | number | undefined>;
}

export interface PromoWriteResult {
  dryRun: boolean;
  request: { method: "POST"; path: string; form: Record<string, string> };
  response?: { status: number; body: unknown };
}

export class PromoCodesResource {
  constructor(private readonly ctx: ImpactContext) {}

  iterate(query?: QueryParams): AsyncGenerator<PromoCode, void, void> {
    return paginate<PromoCode>(this.ctx.http, this.ctx.path("PromoCodes"), {
      dataKey: DATA_KEYS.promoCodes,
      query,
    });
  }

  async list(query?: QueryParams): Promise<PromoCode[]> {
    return collect(this.iterate(query));
  }

  /** Create a promo code (dry-run by default). */
  async create(input: CreatePromoCode): Promise<PromoWriteResult> {
    const form: Record<string, string> = {
      Code: input.code,
      CampaignId: input.campaignId,
    };
    if (input.mediaId) form.MediaId = input.mediaId;
    if (input.description) form.Description = input.description;
    if (input.startDate) form.StartDate = input.startDate.toISOString().slice(0, 10);
    if (input.endDate) form.EndDate = input.endDate.toISOString().slice(0, 10);
    for (const [k, v] of Object.entries(input.extra ?? {})) if (v !== undefined) form[k] = String(v);

    const path = this.ctx.path("PromoCodes");
    if (!this.ctx.config.live) {
      this.ctx.logger.info("promo-code DRY-RUN (not sent)", { path, form });
      return { dryRun: true, request: { method: "POST", path, form } };
    }
    const res = await this.ctx.http.post<unknown>(path, { form });
    return { dryRun: false, request: { method: "POST", path, form }, response: { status: res.status, body: res.data } };
  }
}
