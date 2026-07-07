/**
 * Programs (partner/publisher persona): the advertiser campaigns/programs this
 * media partner participates in. Mirror of `partners.ts` for the other persona.
 */
import type { ImpactContext } from "../client/context.js";
import { paginate, collect } from "../client/pagination.js";
import type { QueryParams } from "../client/http.js";
import { DATA_KEYS } from "./params.js";
import type { Campaign } from "../types/impact.js";

export class ProgramsResource {
  constructor(private readonly ctx: ImpactContext) {}

  /** Programs/campaigns the partner is contracted with. */
  iterate(query?: QueryParams): AsyncGenerator<Campaign, void, void> {
    return paginate<Campaign>(this.ctx.http, this.ctx.path("Campaigns"), {
      dataKey: DATA_KEYS.campaigns,
      pageSize: 500,
      query,
    });
  }

  async list(query?: QueryParams): Promise<Campaign[]> {
    return collect(this.iterate(query));
  }

  async get(campaignId: string): Promise<Campaign> {
    const res = await this.ctx.http.get<Record<string, unknown>>(this.ctx.path("Campaigns", campaignId));
    const body = res.data;
    const nested = body[DATA_KEYS.campaigns] ?? body.Campaign;
    return (Array.isArray(nested) ? nested[0] : (nested ?? body)) as Campaign;
  }
}
