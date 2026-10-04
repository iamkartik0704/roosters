-- Cron-as-a-Service initial schema (plan section 6).
-- Timestamps are epoch milliseconds (INTEGER). Booleans are INTEGER 0/1.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  auth_provider TEXT NOT NULL,            -- 'github' | 'google' | 'dev'
  provider_id   TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free', -- free | pro | team
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_users_provider ON users (auth_provider, provider_id);

CREATE TABLE sessions (
  id_hash    TEXT PRIMARY KEY,            -- sha256 of the bearer token
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE TABLE jobs (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  url               TEXT NOT NULL,
  method            TEXT NOT NULL DEFAULT 'GET',
  headers_enc       TEXT,                 -- AES-GCM encrypted JSON object
  body_enc          TEXT,                 -- AES-GCM encrypted string
  mode              TEXT NOT NULL DEFAULT 'monitor', -- monitor | keepalive
  interval_min      INTEGER NOT NULL DEFAULT 10,
  slot              INTEGER NOT NULL DEFAULT 0,      -- due when (minute % interval_min) = slot
  timeout_ms        INTEGER NOT NULL DEFAULT 30000,
  status            TEXT NOT NULL DEFAULT 'active',  -- active | paused
  state             TEXT NOT NULL DEFAULT 'unknown', -- up | down | unknown
  fail_streak       INTEGER NOT NULL DEFAULT 0,
  success_condition TEXT,                 -- JSON SuccessCondition (Pro)
  last_state_change INTEGER,
  last_status       INTEGER,
  last_error        TEXT,
  plan_priority     INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
-- The tick query filters on status + slot match; this index keeps the status
-- prefix usable. The modulo predicate itself scans the filtered set (fine at
-- the ~300-job free-tier scale; revisit with a slot-bucket design later).
CREATE INDEX idx_jobs_tick ON jobs (status, interval_min, slot);
CREATE INDEX idx_jobs_user ON jobs (user_id, status);

-- State changes and failures only on Free; full run history on Pro.
CREATE TABLE job_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  at          INTEGER NOT NULL,
  kind        TEXT NOT NULL,              -- down | recovered | paused | resumed
  http_status INTEGER,
  error       TEXT,
  duration_ms INTEGER
);
CREATE INDEX idx_job_events_job ON job_events (job_id, at DESC);

-- One row per tick that had jobs due; health + capacity tracking.
CREATE TABLE tick_stats (
  minute      INTEGER PRIMARY KEY,        -- epoch minute
  jobs_run    INTEGER NOT NULL,
  ok          INTEGER NOT NULL,
  failed      INTEGER NOT NULL,
  overflow    INTEGER NOT NULL,           -- due jobs beyond the per-tick budget
  duration_ms INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE alert_channels (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL,               -- email | telegram | discord | slack | webhook
  target_enc TEXT NOT NULL,               -- AES-GCM encrypted email / webhook URL
  verified   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE heartbeats (
  job_id             TEXT PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
  token              TEXT NOT NULL UNIQUE,
  expected_every_min INTEGER NOT NULL,
  grace_min          INTEGER NOT NULL DEFAULT 5,
  last_seen          INTEGER
);

CREATE TABLE subscriptions (
  user_id               TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  razorpay_sub_id       TEXT NOT NULL,
  plan                  TEXT NOT NULL,
  status                TEXT NOT NULL,    -- active | past_due | cancelled | halted
  current_end           INTEGER,
  cancel_at_period_end  INTEGER NOT NULL DEFAULT 0,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE payment_events (
  event_id    TEXT PRIMARY KEY,           -- Razorpay event id; webhook idempotency
  type        TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE coupons (
  code             TEXT PRIMARY KEY,
  plan_scope       TEXT NOT NULL,         -- which plan(s) the coupon is valid on
  discount_plan_id TEXT NOT NULL,         -- Razorpay plan id checkout should use
  max_redemptions  INTEGER NOT NULL,
  redeemed         INTEGER NOT NULL DEFAULT 0,
  expires_at       INTEGER,
  active           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE coupon_redemptions (
  code            TEXT NOT NULL REFERENCES coupons (code),
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL,
  redeemed_at     INTEGER NOT NULL,
  UNIQUE (code, user_id)
);

CREATE TABLE api_keys (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  hash       TEXT NOT NULL,               -- sha256 of the key
  last_used  INTEGER,
  created_at INTEGER NOT NULL
);

-- Phase 0 waitlist for the landing page.
CREATE TABLE waitlist (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  source     TEXT,
  created_at INTEGER NOT NULL
);
