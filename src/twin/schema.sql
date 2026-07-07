-- ============================================================================
-- SVEE//TWIN pipeline schema (PostgreSQL / Supabase) — system of record for the
-- job-application twin. Shares the warehouse with the impact.com sync layer.
--
-- Conventions match the sync schema: natural-key PKs (idempotent upserts), a
-- `raw jsonb` escape hatch, and a `synced_at` stamp for observability. The
-- `twin_approvals` table is the SAFETY MODEL: every hard-stop action is a row
-- here with status='pending' until Svee taps approve. The executor has no
-- credential store and no auto-submit path — nothing at a login/submit boundary
-- happens without an approved row.
--
-- Idempotent (IF NOT EXISTS) — safe to run repeatedly.
-- ============================================================================

-- Scored postings. PK = deterministic job key (url or company::role).
CREATE TABLE IF NOT EXISTS twin_jobs (
  job_key       text PRIMARY KEY,
  source        text,
  company       text,
  role          text,
  url           text,
  location      text,
  work_mode     text,
  comp_min      numeric(18,2),
  comp_currency text,
  fit_score     integer,
  tier          text,            -- discard | stretch | prioritize
  hard_filter   text,            -- non-null ⇒ auto-rejected; the reason
  status        text,            -- scored | discarded | staged | submitted | closed
  facts         jsonb,
  reasons       jsonb,
  scored_at     timestamptz,
  raw           jsonb NOT NULL DEFAULT '{}',
  synced_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_twin_jobs_status ON twin_jobs (status);
CREATE INDEX IF NOT EXISTS idx_twin_jobs_tier ON twin_jobs (tier);
CREATE INDEX IF NOT EXISTS idx_twin_jobs_score ON twin_jobs (fit_score);

-- Applications (one per role we tailored for). PK = uuid.
CREATE TABLE IF NOT EXISTS twin_applications (
  id            text PRIMARY KEY,
  job_key       text,
  company       text,
  role          text,
  channel       text,
  cv_variant    text,
  status        text,            -- staged | submitted | interviewing | offer | rejected | ghosted | withdrawn
  fit_score     integer,
  cover_letter  text,
  screening     jsonb,
  missing_fields jsonb,
  approval_id   text,
  submitted_at  timestamptz,
  followup_due  timestamptz,
  created_at    timestamptz,
  raw           jsonb NOT NULL DEFAULT '{}',
  synced_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_twin_apps_status ON twin_applications (status);
CREATE INDEX IF NOT EXISTS idx_twin_apps_job ON twin_applications (job_key);
CREATE INDEX IF NOT EXISTS idx_twin_apps_followup ON twin_applications (followup_due);

-- Inbound/outbound messages. PK = provider message id (dedupe).
CREATE TABLE IF NOT EXISTS twin_messages (
  id            text PRIMARY KEY,
  application_id text,
  direction     text,            -- inbound | outbound
  kind          text,            -- rejection | recruiter_screen | interview_request | offer | ghost_followup | application | followup | other
  subject       text,
  snippet       text,
  from_addr     text,
  signals       jsonb,
  classified_at timestamptz,
  raw           jsonb NOT NULL DEFAULT '{}',
  synced_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_twin_msgs_app ON twin_messages (application_id);
CREATE INDEX IF NOT EXISTS idx_twin_msgs_kind ON twin_messages (kind);

-- Approval queue — the safety model. PK = uuid.
CREATE TABLE IF NOT EXISTS twin_approvals (
  id                text PRIMARY KEY,
  type              text,        -- submit_application | send_email | linkedin_easy_apply | send_followup | confirm_interview
  company           text,
  role              text,
  url               text,
  channel           text,
  cv_variant        text,
  status            text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | executed | expired
  fit_score         integer,
  action_on_approve text,
  payload           jsonb,       -- cover_letter, screening_answers, missing_fields
  created_at        timestamptz,
  decided_at        timestamptz,
  raw               jsonb NOT NULL DEFAULT '{}',
  synced_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_twin_approvals_status ON twin_approvals (status);

-- Daily digests. PK = run id.
CREATE TABLE IF NOT EXISTS twin_digests (
  id                 text PRIMARY KEY,
  run_at             timestamptz,
  found              integer,
  scored             integer,
  passed_threshold   integer,
  staged             integer,
  submitted_prev_run integer,
  discarded_low_fit  integer,
  needs_decision     jsonb,
  top_matches        jsonb,
  raw                jsonb NOT NULL DEFAULT '{}',
  synced_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_twin_digests_run ON twin_digests (run_at);

-- Versioned KB snapshots (so KB updates are attributable / diffable).
CREATE TABLE IF NOT EXISTS twin_kb (
  version    text PRIMARY KEY,
  kb         jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
