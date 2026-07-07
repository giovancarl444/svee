/**
 * Unique URLs / deep links. Similar to tracking links but for the "Unique URL"
 * product (per-partner vanity/deep links). Kept as its own module because the
 * endpoint and semantics differ.
 *
 * VERIFY the endpoint path/params against the Unique URLs reference.
 */
import type { ImpactContext } from "../client/context.js";
import type { QueryParams } from "../client/http.js";

export interface UniqueUrlRequest {
  campaignId: string;
  /** Destination URL to convert into a unique tracking URL. */
  url: string;
  mediaPartnerId?: string;
  subId1?: string;
  extra?: QueryParams;
}

export interface UniqueUrl {
  Url?: string;
  RedirectUrl?: string;
  [key: string]: unknown;
}

export class UniqueUrlsResource {
  constructor(private readonly ctx: ImpactContext) {}

  async create(req: UniqueUrlRequest): Promise<UniqueUrl> {
    const query: QueryParams = { Url: req.url, ...req.extra };
    if (req.mediaPartnerId) query.MediaPartnerId = req.mediaPartnerId;
    if (req.subId1) query.SubId1 = req.subId1;

    const path = this.ctx.path("Campaigns", req.campaignId, "UniqueUrls");
    const res = await this.ctx.http.get<Record<string, unknown>>(path, { query });
    const body = res.data;
    const nested = body.UniqueUrls;
    return (Array.isArray(nested) ? nested[0] : (body.UniqueUrl ?? body)) as UniqueUrl;
  }
}
