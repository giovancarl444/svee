/**
 * Query-parameter names for list/report endpoints, centralised so a single
 * correction fixes every caller. These are the commonly-documented names but
 * were NOT verified against live docs in this build (egress blocked).
 *
 * VERIFY each against the relevant reference before relying on filtering live —
 * an unrecognised filter param is typically ignored (returns unfiltered data),
 * which is a silent correctness bug, not an error.
 */

export const ACTION_PARAMS = {
  // Confirmed against a live partner account: the Actions endpoint 400s on
  // StartDate/EndDate and expects ActionDateStart/ActionDateEnd.
  startDate: "ActionDateStart",
  endDate: "ActionDateEnd",
  campaignId: "CampaignId",
  mediaId: "MediaId",
  actionTrackerId: "ActionTrackerId",
  state: "Status", // VERIFY status vocabulary from live data (PENDING/LOCKED/…)
} as const;

export const CLICK_PARAMS = {
  startDate: "StartDate", // VERIFY
  endDate: "EndDate", // VERIFY
  campaignId: "CampaignId",
  mediaId: "MediaId",
} as const;

export const REPORT_PARAMS = {
  startDate: "START_DATE", // VERIFY (impact report params are often UPPER_SNAKE)
  endDate: "END_DATE",
  timezone: "TIMEZONE",
  resultFormat: "ResultFormat", // JSON | CSV — VERIFY casing
} as const;

/** Data-array keys inside list envelopes, per resource. VERIFY. */
export const DATA_KEYS = {
  campaigns: "Campaigns",
  actions: "Actions",
  clicks: "Clicks",
  mediaPartners: "MediaPartners", // VERIFY (also seen: "Media")
  contracts: "Contracts",
  catalogs: "Catalogs",
  catalogItems: "Items", // VERIFY (also seen: "CatalogItems")
  reports: "Reports",
  promoCodes: "PromoCodes",
  deals: "Deals",
  mediaProperties: "MediaProperties", // VERIFY (also seen: "Properties")
  trackingLinks: "TrackingLinks",
} as const;
