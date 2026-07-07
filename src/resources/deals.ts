/**
 * Deals (partner/publisher persona): promotional deals offered by advertisers
 * that a partner can promote.
 *
 * VERIFY the path (/Mediapartners/{SID}/Deals) and the envelope key against the
 * Deals reference.
 */
import type { ImpactContext } from "../client/context.js";
import { paginate, collect } from "../client/pagination.js";
import type { QueryParams } from "../client/http.js";
import { DATA_KEYS } from "./params.js";
import type { Deal } from "../types/impact.js";

export class DealsResource {
  constructor(private readonly ctx: ImpactContext) {}

  iterate(query?: QueryParams): AsyncGenerator<Deal, void, void> {
    return paginate<Deal>(this.ctx.http, this.ctx.path("Deals"), {
      dataKey: DATA_KEYS.deals,
      pageSize: 500,
      query,
    });
  }

  async list(query?: QueryParams): Promise<Deal[]> {
    return collect(this.iterate(query));
  }

  async get(id: string): Promise<Deal> {
    const res = await this.ctx.http.get<Record<string, unknown>>(this.ctx.path("Deals", id));
    const body = res.data;
    const nested = body[DATA_KEYS.deals] ?? body.Deal;
    return (Array.isArray(nested) ? nested[0] : (nested ?? body)) as Deal;
  }
}
