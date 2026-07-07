/**
 * Clicks. Read layer: paginated list with date/campaign/partner filters.
 * Click volumes are large — always iterate rather than materialising eagerly.
 */
import type { ImpactContext } from "../client/context.js";
import { paginate, collect } from "../client/pagination.js";
import type { QueryParams } from "../client/http.js";
import { CLICK_PARAMS, DATA_KEYS } from "./params.js";
import { toImpactDateTime } from "../util/date.js";
import type { Click } from "../types/impact.js";

export interface ClickListFilters {
  startDate?: Date;
  endDate?: Date;
  campaignId?: string;
  mediaId?: string;
  pageSize?: number;
  extra?: QueryParams;
}

export class ClicksResource {
  constructor(private readonly ctx: ImpactContext) {}

  iterate(filters: ClickListFilters = {}): AsyncGenerator<Click, void, void> {
    return paginate<Click>(this.ctx.http, this.ctx.path("Clicks"), {
      dataKey: DATA_KEYS.clicks,
      pageSize: filters.pageSize ?? 1000,
      query: this.buildQuery(filters),
    });
  }

  async list(filters: ClickListFilters = {}, limit = Infinity): Promise<Click[]> {
    return collect(this.iterate(filters), limit);
  }

  iterateSince(since: Date, filters: Omit<ClickListFilters, "startDate"> = {}): AsyncGenerator<Click, void, void> {
    return this.iterate({ ...filters, startDate: since });
  }

  private buildQuery(filters: ClickListFilters): QueryParams {
    const q: QueryParams = { ...filters.extra };
    if (filters.startDate) q[CLICK_PARAMS.startDate] = toImpactDateTime(filters.startDate);
    if (filters.endDate) q[CLICK_PARAMS.endDate] = toImpactDateTime(filters.endDate);
    if (filters.campaignId) q[CLICK_PARAMS.campaignId] = filters.campaignId;
    if (filters.mediaId) q[CLICK_PARAMS.mediaId] = filters.mediaId;
    return q;
  }
}
