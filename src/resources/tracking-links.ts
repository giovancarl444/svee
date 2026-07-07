/**
 * Tracking-link generation. Produce partner tracking links / deep links
 * programmatically for a campaign, optionally with a deep-link target and SubIds.
 *
 * Generation is a read-style GET (it returns a link, it doesn't mutate account
 * state), so it runs regardless of the live/dry-run gate.
 *
 * VERIFY (docs egress blocked): the exact path + param names. On the partner
 * persona this is typically /Mediapartners/{SID}/Campaigns/{CampaignId}/TrackingLinks;
 * on the brand persona the equivalent differs. DATA_KEYS.trackingLinks holds the
 * envelope key.
 */
import type { ImpactContext } from "../client/context.js";
import type { QueryParams } from "../client/http.js";
import type { TrackingLink } from "../types/impact.js";

export interface TrackingLinkRequest {
  campaignId: string;
  /** Deep-link destination URL to wrap. */
  deepLink?: string;
  /** Partner (brand persona may need to specify which partner). */
  mediaPartnerId?: string;
  subId1?: string;
  subId2?: string;
  subId3?: string;
  /** Link type, e.g. "regular" | "vanity". VERIFY vocabulary. */
  type?: string;
  extra?: QueryParams;
}

export class TrackingLinksResource {
  constructor(private readonly ctx: ImpactContext) {}

  /** Generate a tracking link for a campaign. */
  async create(req: TrackingLinkRequest): Promise<TrackingLink> {
    const query: QueryParams = { ...req.extra };
    if (req.deepLink) query.DeepLink = req.deepLink;
    if (req.mediaPartnerId) query.MediaPartnerId = req.mediaPartnerId;
    if (req.subId1) query.SubId1 = req.subId1;
    if (req.subId2) query.SubId2 = req.subId2;
    if (req.subId3) query.SubId3 = req.subId3;
    if (req.type) query.Type = req.type;

    const path = this.ctx.path("Campaigns", req.campaignId, "TrackingLinks");
    const res = await this.ctx.http.get<Record<string, unknown>>(path, { query });
    const body = res.data;
    const nested = body.TrackingLinks;
    const link = (Array.isArray(nested) ? nested[0] : (body.TrackingLink ?? body)) as TrackingLink;
    return link;
  }
}
