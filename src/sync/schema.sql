-- ============================================================================
-- impact.com sync warehouse schema (PostgreSQL / Supabase)
-- ----------------------------------------------------------------------------
-- Normalized, idempotent, incremental. Every table:
--   * uses the impact.com NATURAL KEY as its primary key (so re-running a sync
--     is a no-op UPSERT, never a duplicate);
--   * keeps the raw payload in a `raw jsonb` column (schema-flexible: new API
--     fields survive even before we map them to typed columns);
--   * stamps `synced_at` for observability + retention.
--
-- Retention (GDPR §3.8): click/action rows are PII-adjacent. The sync job purges
-- rows older than DATA_RETENTION_DAYS by their event_date. Aggregated
-- daily_performance is retained (no row-level PII) for long-term trend.
--
-- This script is idempotent (IF NOT EXISTS) — safe to run repeatedly.
-- ============================================================================

-- Sync watermarks: last successfully-synced timestamp per logical source.
CREATE TABLE IF NOT EXISTS sync_state (
  source      text PRIMARY KEY,           -- e.g. 'actions', 'clicks'
  watermark   timestamptz,                -- high-water mark of last pull
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Media partners (advertiser persona) / relationships.
CREATE TABLE IF NOT EXISTS partners (
  media_id    text PRIMARY KEY,
  name        text,
  status      text,
  website     text,
  country     text,
  raw         jsonb NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now()
);

-- Contracts / partnership agreements.
CREATE TABLE IF NOT EXISTS contracts (
  id          text PRIMARY KEY,
  name        text,
  media_id    text,
  status      text,
  start_date  timestamptz,
  end_date    timestamptz,
  raw         jsonb NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contracts_media ON contracts (media_id);

-- Actions = conversions/events.
CREATE TABLE IF NOT EXISTS actions (
  id                text PRIMARY KEY,      -- impact action id
  campaign_id       text,
  action_tracker_id text,
  media_id          text,
  state             text,                  -- PENDING | APPROVED | REVERSED | REJECTED
  amount            numeric(18,4),         -- sale/order amount
  payout            numeric(18,4),         -- commission we pay
  currency          text,
  order_id          text,                  -- our order id (dedupe key upstream)
  oid               text,                  -- impact order id
  event_date        timestamptz,
  creation_date     timestamptz,
  subid1            text,                  -- Shopify store / placement / campaign
  subid2            text,
  subid3            text,
  raw               jsonb NOT NULL,
  synced_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actions_event_date ON actions (event_date);
CREATE INDEX IF NOT EXISTS idx_actions_media ON actions (media_id);
CREATE INDEX IF NOT EXISTS idx_actions_state ON actions (state);
CREATE INDEX IF NOT EXISTS idx_actions_order ON actions (order_id);
CREATE INDEX IF NOT EXISTS idx_actions_subid1 ON actions (subid1);

-- Clicks (high volume).
CREATE TABLE IF NOT EXISTS clicks (
  id                text PRIMARY KEY,
  campaign_id       text,
  media_id          text,
  event_date        timestamptz,
  referral_url      text,
  landing_page_url  text,
  subid1            text,
  subid2            text,
  subid3            text,
  raw               jsonb NOT NULL,
  synced_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clicks_event_date ON clicks (event_date);
CREATE INDEX IF NOT EXISTS idx_clicks_media ON clicks (media_id);

-- Catalog items (composite natural key: catalog + item).
CREATE TABLE IF NOT EXISTS catalog_items (
  catalog_id      text NOT NULL,
  catalog_item_id text NOT NULL,
  name            text,
  category        text,
  current_price   numeric(18,4),
  original_price  numeric(18,4),
  currency        text,
  availability    text,
  url             text,
  image_url       text,
  raw             jsonb NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_id, catalog_item_id)
);
CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON catalog_items (category);

-- Daily performance aggregates (from report export). No row-level PII -> retained.
CREATE TABLE IF NOT EXISTS daily_performance (
  day          date NOT NULL,
  media_id     text NOT NULL DEFAULT '',
  campaign_id  text NOT NULL DEFAULT '',
  clicks       bigint NOT NULL DEFAULT 0,
  actions      bigint NOT NULL DEFAULT 0,
  revenue      numeric(18,4) NOT NULL DEFAULT 0,
  payout       numeric(18,4) NOT NULL DEFAULT 0,
  currency     text,
  raw          jsonb NOT NULL,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, media_id, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_perf_day ON daily_performance (day);

-- Programs / campaigns (advertiser programs a partner promotes, or a brand's
-- own campaigns). Gives by-program breakdowns a human-readable name.
CREATE TABLE IF NOT EXISTS programs (
  campaign_id     text PRIMARY KEY,
  name            text,
  advertiser_id   text,
  advertiser_name text,
  status          text,
  raw             jsonb NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now()
);

-- Media properties (partner persona): the partner's own sites/apps.
CREATE TABLE IF NOT EXISTS media_properties (
  id          text PRIMARY KEY,
  name        text,
  type        text,
  url         text,
  status      text,
  raw         jsonb NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now()
);

-- Deals (partner persona): promotional deals offered by advertisers.
CREATE TABLE IF NOT EXISTS deals (
  id            text PRIMARY KEY,
  name          text,
  campaign_id   text,
  advertiser_id text,
  description   text,
  discount_type text,
  start_date    timestamptz,
  end_date      timestamptz,
  raw           jsonb NOT NULL,
  synced_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deals_campaign ON deals (campaign_id);

-- Webhook/postback event log for dedupe + audit (§Phase 3).
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id     text PRIMARY KEY,          -- provider event id (dedupe)
  event_type   text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  signature_ok boolean NOT NULL DEFAULT false,
  payload      jsonb NOT NULL
);
