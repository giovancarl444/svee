/**
 * Map impact.com API objects to warehouse rows. Pure functions (easy to test),
 * total (bad fields coerce to null, never throw), and natural-key-first so the
 * upsert stays idempotent. The full payload is preserved in `raw`.
 *
 * Natural-key resolution tries several documented-but-unverified field names
 * (see firstOf candidates + VERIFY notes) so a rename upstream degrades to a
 * null key we can spot, rather than silently mis-keying rows.
 */
import type { Action, Click, MediaPartner, Contract, CatalogItem, ReportRow, MediaProperty, Deal, Campaign } from "../types/impact.js";
import { toNumber, toDate, toDateOnly, str, firstOf } from "../util/coerce.js";
import type { Row } from "./db.js";

export function actionToRow(a: Action): Row | null {
  const id = firstOf(a, ["Id", "ActionId"]); // VERIFY primary id field
  if (!id) return null;
  return {
    id,
    campaign_id: str(a.CampaignId),
    action_tracker_id: str(a.ActionTrackerId),
    media_id: firstOf(a, ["MediaId", "MediaPartnerId"]),
    state: firstOf(a, ["State", "Status"]),
    amount: toNumber(a.Amount),
    payout: toNumber(a.Payout),
    currency: str(a.Currency),
    order_id: str(a.OrderId),
    oid: str(a.Oid),
    event_date: toDate(a.EventDate),
    creation_date: toDate(a.CreationDate),
    subid1: str(a.SubId1),
    subid2: str(a.SubId2),
    subid3: str(a.SubId3),
    raw: a,
  };
}

export function clickToRow(c: Click): Row | null {
  const id = firstOf(c, ["Id", "ClickId"]);
  if (!id) return null;
  return {
    id,
    campaign_id: str(c.CampaignId),
    media_id: firstOf(c, ["MediaId", "MediaPartnerId"]),
    event_date: toDate(firstOf(c, ["EventDate", "DateTime"])),
    referral_url: str(c.ReferralUrl),
    landing_page_url: str(c.LandingPageUrl),
    subid1: str(c.SubId1),
    subid2: str(c.SubId2),
    subid3: str(c.SubId3),
    raw: c,
  };
}

export function partnerToRow(p: MediaPartner): Row | null {
  const mediaId = firstOf(p, ["MediaId", "Id", "MediaPartnerId"]);
  if (!mediaId) return null;
  return {
    media_id: mediaId,
    name: firstOf(p, ["MediaName", "Name"]),
    status: str(p.Status),
    website: str(p.Website),
    country: str(p.Country),
    raw: p,
  };
}

export function contractToRow(c: Contract): Row | null {
  const id = firstOf(c, ["Id"]);
  if (!id) return null;
  return {
    id,
    name: str(c.Name),
    media_id: firstOf(c, ["MediaId"]),
    status: str(c.Status),
    start_date: toDate(c.StartDate),
    end_date: toDate(c.EndDate),
    raw: c,
  };
}

export function catalogItemToRow(catalogId: string, it: CatalogItem): Row | null {
  const itemId = firstOf(it, ["CatalogItemId", "Id", "ItemId"]);
  if (!itemId) return null;
  return {
    catalog_id: catalogId,
    catalog_item_id: itemId,
    name: str(it.Name),
    category: str(it.Category),
    current_price: toNumber(it.CurrentPrice),
    original_price: toNumber(it.OriginalPrice),
    currency: str(it.Currency),
    availability: firstOf(it, ["Availability", "StockAvailability"]),
    url: str(it.Url),
    image_url: str(it.ImageUrl),
    raw: it,
  };
}

export function programToRow(c: Campaign): Row | null {
  const id = firstOf(c, ["CampaignId", "Id"]);
  if (!id) return null;
  return {
    campaign_id: id,
    name: str(c.Name),
    advertiser_id: firstOf(c, ["AdvertiserId"]),
    advertiser_name: firstOf(c, ["AdvertiserName"]),
    status: firstOf(c, ["ContractStatus", "Status"]),
    raw: c,
  };
}

export function mediaPropertyToRow(p: MediaProperty): Row | null {
  const id = firstOf(p, ["Id"]);
  if (!id) return null;
  return {
    id,
    name: str(p.Name),
    type: firstOf(p, ["Type", "PropertyType"]),
    url: str(p.Url),
    status: str(p.Status),
    raw: p,
  };
}

export function dealToRow(d: Deal): Row | null {
  const id = firstOf(d, ["Id"]);
  if (!id) return null;
  return {
    id,
    name: str(d.Name),
    campaign_id: firstOf(d, ["CampaignId"]),
    advertiser_id: firstOf(d, ["AdvertiserId"]),
    description: str(d.Description),
    discount_type: str(d.DiscountType),
    start_date: toDate(d.StartDate),
    end_date: toDate(d.EndDate),
    raw: d,
  };
}

/**
 * Map a performance report row to a daily_performance row. Report column names
 * vary by report; we probe several candidates. VERIFY the actual column names
 * from your report's header and extend CANDIDATES as needed.
 */
const CANDIDATES = {
  date: ["Date", "date", "DATE", "Day"],
  mediaId: ["MediaId", "media_id", "PartnerId"],
  campaignId: ["CampaignId", "campaign_id"],
  clicks: ["Clicks", "clicks", "TotalClicks"],
  actions: ["Actions", "actions", "TotalActions", "Conversions"],
  revenue: ["SaleAmount", "Revenue", "sale_amount", "Sales"],
  payout: ["Payout", "Cost", "Commission", "payout"],
  currency: ["Currency", "currency"],
} as const;

export function reportRowToDaily(row: ReportRow): Row | null {
  const day = toDateOnly(firstOf(row, [...CANDIDATES.date]));
  if (!day) return null;
  return {
    day,
    media_id: firstOf(row, [...CANDIDATES.mediaId]) ?? "",
    campaign_id: firstOf(row, [...CANDIDATES.campaignId]) ?? "",
    clicks: Math.trunc(toNumber(firstOf(row, [...CANDIDATES.clicks])) ?? 0),
    actions: Math.trunc(toNumber(firstOf(row, [...CANDIDATES.actions])) ?? 0),
    revenue: toNumber(firstOf(row, [...CANDIDATES.revenue])) ?? 0,
    payout: toNumber(firstOf(row, [...CANDIDATES.payout])) ?? 0,
    currency: firstOf(row, [...CANDIDATES.currency]),
    raw: row,
  };
}
