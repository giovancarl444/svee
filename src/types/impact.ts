/**
 * Domain models for impact.com resources.
 *
 * These are a CURATED, HAND-WRITTEN subset of the real payloads — enough to be
 * useful and typed today. The intended source of truth is types generated from
 * each persona's OpenAPI spec (see `src/scripts/gen-types.ts`); that generation
 * could not run in this build because egress to impact.com was blocked.
 *
 * Two deliberate choices:
 *   - Every model carries an index signature so unknown/extra fields from the
 *     wire never break parsing (the real objects have many more fields).
 *   - Money and dates are typed as the STRINGS impact.com actually returns.
 *     Coercion happens in the sync layer, not here — this stays wire-faithful.
 *
 * VERIFY every field name marked below against the live reference / OpenAPI spec
 * before trusting it in a write path.
 */

/** Common envelope key wrapper — impact.com meta fields are `@`-prefixed strings. */
export interface PagedEnvelope<T> {
  "@page"?: string;
  "@numpages"?: string;
  "@pagesize"?: string;
  "@total"?: string;
  "@nextpageuri"?: string;
  [resourceKey: string]: T[] | string | undefined;
}

export interface Campaign {
  CampaignId?: string;
  Name?: string;
  AdvertiserId?: string;
  AdvertiserName?: string;
  ContractStatus?: string;
  [key: string]: unknown;
}

/** A media partner (publisher/affiliate) from a brand's perspective. */
export interface MediaPartner {
  MediaId?: string; // partner account id — VERIFY (also seen as Id / MediaPartnerId)
  MediaName?: string;
  Status?: string; // e.g. Active / Pending / Suspended
  Website?: string;
  Country?: string;
  [key: string]: unknown;
}

export interface Contract {
  Id?: string;
  Name?: string;
  MediaId?: string;
  MediaName?: string;
  Status?: string; // Active / Pending / Ended
  StartDate?: string;
  EndDate?: string;
  [key: string]: unknown;
}

/** An action = a tracked conversion/event (sale, lead, install). */
export interface Action {
  Id?: string;
  CampaignId?: string;
  ActionTrackerId?: string;
  ActionTrackerName?: string;
  MediaId?: string;
  MediaName?: string;
  State?: string; // PENDING | APPROVED | REVERSED | REJECTED — VERIFY
  Status?: string;
  Payout?: string; // commission we pay the partner
  Amount?: string; // sale/order amount
  Currency?: string;
  Oid?: string; // impact's order id
  OrderId?: string; // our order id (idempotency key)
  EventDate?: string;
  CreationDate?: string;
  ReferringDate?: string;
  ClearedDate?: string;
  SubId1?: string;
  SubId2?: string;
  SubId3?: string;
  [key: string]: unknown;
}

export interface Click {
  Id?: string;
  CampaignId?: string;
  MediaId?: string;
  MediaName?: string;
  EventDate?: string;
  DateTime?: string;
  ReferralUrl?: string;
  LandingPageUrl?: string;
  SubId1?: string;
  SubId2?: string;
  SubId3?: string;
  [key: string]: unknown;
}

export interface Catalog {
  Id?: string;
  Name?: string;
  AdvertiserId?: string;
  NumberOfItems?: string;
  Status?: string;
  DateLastUpdated?: string;
  [key: string]: unknown;
}

export interface CatalogItem {
  CatalogItemId?: string;
  CatalogId?: string;
  Name?: string;
  Description?: string;
  CurrentPrice?: string;
  OriginalPrice?: string;
  Currency?: string;
  Availability?: string;
  Category?: string;
  ImageUrl?: string;
  Url?: string;
  Gtin?: string;
  Mpn?: string;
  StockAvailability?: string;
  [key: string]: unknown;
}

export interface ReportMeta {
  Id?: string;
  Name?: string;
  ApiAccessible?: string;
  Category?: string;
  [key: string]: unknown;
}

/** Async job envelope (deferred exports). */
export interface Job {
  Id?: string;
  Status?: string;
  QueuedUri?: string;
  ResultUri?: string | null;
  ResultMd5?: string;
  [key: string]: unknown;
}

export interface TrackingLink {
  TrackingLink?: string;
  Landing?: string;
  DeepLink?: string;
  [key: string]: unknown;
}

export interface PromoCode {
  Id?: string;
  Code?: string;
  CampaignId?: string;
  MediaId?: string;
  Description?: string;
  StartDate?: string;
  EndDate?: string;
  Status?: string;
  [key: string]: unknown;
}

export interface Deal {
  Id?: string;
  Name?: string;
  CampaignId?: string;
  AdvertiserId?: string;
  Description?: string;
  DiscountType?: string;
  StartDate?: string;
  EndDate?: string;
  [key: string]: unknown;
}

/** A partner's own tracked property (website, app, etc.). Partner persona. */
export interface MediaProperty {
  Id?: string;
  Name?: string;
  Type?: string; // WEBSITE | MOBILE_APP | PAID_SEARCH | ... — VERIFY
  Url?: string;
  Status?: string;
  [key: string]: unknown;
}

/** A single row of a performance report (columns depend on the report). */
export type ReportRow = Record<string, string>;

/** Canonical action states, normalised. VERIFY the exact wire vocabulary. */
export const ACTION_STATE = {
  pending: "PENDING",
  approved: "APPROVED",
  reversed: "REVERSED",
  rejected: "REJECTED",
} as const;
export type ActionState = (typeof ACTION_STATE)[keyof typeof ACTION_STATE];
