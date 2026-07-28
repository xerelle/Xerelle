-- Xerelle v1 database schema (D1 / SQLite)
-- Covers: models, subscribers, subscriptions, PPV, tips, model-to-model
-- referrals, the milestone bonus, video call bookings, and Stories.
-- Explicit-content fields are included but unused until the v2 module ships.

-- ============================================================
-- MODELS
-- ============================================================
CREATE TABLE models (
  id TEXT PRIMARY KEY,               -- uuid
  username TEXT UNIQUE NOT NULL,     -- exact-match handle, e.g. "amara.room"
  display_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,

  -- verification
  verification_status TEXT NOT NULL DEFAULT 'pending', -- pending | verified | rejected | suspended
  id_document_url TEXT,              -- R2 key, never exposed to subscribers
  liveness_selfie_url TEXT,           -- R2 key
  verified_at INTEGER,               -- unix timestamp

  -- room settings
  room_type TEXT NOT NULL DEFAULT 'standard', -- standard | explicit (v2 only)
  discoverable INTEGER NOT NULL DEFAULT 0,    -- 0 = link-only/private, 1 = appears in Discover
  video_calls_enabled INTEGER NOT NULL DEFAULT 0,

  -- teaser media shown to non-subscribers on her landing page
  teaser_media_url TEXT,             -- R2 key, fixed (not the rotating Story)

  -- referral
  referred_by_model_id TEXT REFERENCES models(id),

  -- payout
  payout_bank_details TEXT,          -- encrypted JSON blob

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_models_username ON models(username);
CREATE INDEX idx_models_referred_by ON models(referred_by_model_id);

-- ============================================================
-- SUBSCRIBERS
-- ============================================================
CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- one-time free trial message tracking (per subscriber, per model, ever)
CREATE TABLE trial_messages (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  sent_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(subscriber_id, model_id)    -- enforces "one time, no reset"
);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  status TEXT NOT NULL DEFAULT 'active', -- active | cancelled | expired
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  current_period_end INTEGER NOT NULL,
  cancelled_at INTEGER,

  -- fan tier / badge tracking
  tier TEXT NOT NULL DEFAULT 'new_fan', -- new_fan | regular | vip

  UNIQUE(subscriber_id, model_id)
);

CREATE INDEX idx_subscriptions_model ON subscriptions(model_id);
CREATE INDEX idx_subscriptions_subscriber ON subscriptions(subscriber_id);

-- ============================================================
-- TRANSACTIONS (subscriptions, PPV, tips, video calls — one ledger)
-- ============================================================
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                -- subscription | ppv | tip | video_call
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  model_id TEXT NOT NULL REFERENCES models(id),

  amount_kobo INTEGER NOT NULL,      -- store in kobo to avoid float issues
  model_share_kobo INTEGER NOT NULL,
  platform_share_kobo INTEGER NOT NULL,
  split_rate TEXT NOT NULL,          -- e.g. "65/35", "80/20" — for audit clarity

  payment_provider TEXT NOT NULL,    -- paystack | monnify
  payment_reference TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | failed | refunded

  -- retention tracking, used by the milestone + referral bonus logic
  retention_cleared_at INTEGER,       -- set 7 days after confirmation, if still active

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_transactions_model ON transactions(model_id);
CREATE INDEX idx_transactions_subscriber ON transactions(subscriber_id);
CREATE INDEX idx_transactions_status ON transactions(status);

-- ============================================================
-- PPV CONTENT
-- ============================================================
CREATE TABLE ppv_items (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  media_type TEXT NOT NULL,          -- photo | video
  media_url TEXT NOT NULL,           -- R2 key
  price_kobo INTEGER NOT NULL,
  caption TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE ppv_unlocks (
  id TEXT PRIMARY KEY,
  ppv_item_id TEXT NOT NULL REFERENCES ppv_items(id),
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  unlocked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(ppv_item_id, subscriber_id)
);

-- ============================================================
-- STORIES (24-hour free daily update)
-- ============================================================
CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  media_type TEXT NOT NULL,          -- photo | video
  media_url TEXT NOT NULL,
  caption TEXT,
  posted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL        -- posted_at + 24h, enforced at query time too
);

CREATE INDEX idx_stories_model_expiry ON stories(model_id, expires_at);

-- ============================================================
-- MESSAGES (chat)
-- ============================================================
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  sender_type TEXT NOT NULL,         -- subscriber | model
  body TEXT,
  sent_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_messages_thread ON messages(subscriber_id, model_id, sent_at);

-- ============================================================
-- MILESTONE BONUS (per model, first 10 subscribers, ₦1,000 each,
-- all-or-nothing withdrawal at ₦10,000 — switched off until launch milestone)
-- ============================================================
CREATE TABLE milestone_bonus_progress (
  model_id TEXT PRIMARY KEY REFERENCES models(id),
  qualifying_subscriber_count INTEGER NOT NULL DEFAULT 0, -- 0-10
  accrued_kobo INTEGER NOT NULL DEFAULT 0,
  withdrawable INTEGER NOT NULL DEFAULT 0,  -- 0/1, flips to 1 only at 10/10
  withdrawn_at INTEGER
);

-- ============================================================
-- MODEL-TO-MODEL REFERRAL BONUS (₦500/subscriber of the referred model,
-- uncapped, continues indefinitely as long as she's active)
-- ============================================================
CREATE TABLE referral_bonus_ledger (
  id TEXT PRIMARY KEY,
  referring_model_id TEXT NOT NULL REFERENCES models(id),
  referred_model_id TEXT NOT NULL REFERENCES models(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id), -- the referred model's subscriber payment that triggered this
  amount_kobo INTEGER NOT NULL,       -- 500 * 100 = 50000 kobo
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_referral_ledger_referring ON referral_bonus_ledger(referring_model_id);

-- ============================================================
-- VIDEO CALLS
-- ============================================================
CREATE TABLE video_call_slots (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  day_of_week INTEGER NOT NULL,      -- 0=Sun .. 6=Sat
  start_time TEXT NOT NULL,          -- "18:00"
  duration_minutes INTEGER NOT NULL, -- 10 | 15 | 30
  price_kobo INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE video_call_bookings (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES video_call_slots(id),
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  scheduled_at INTEGER NOT NULL,     -- actual unix timestamp of the booked call
  status TEXT NOT NULL DEFAULT 'booked', -- booked | completed | model_no_show | subscriber_no_show | cancelled
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ============================================================
-- REPORTS (always-available safety mechanism)
-- ============================================================
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_type TEXT NOT NULL,       -- subscriber | model
  reporter_id TEXT NOT NULL,
  reported_type TEXT NOT NULL,       -- subscriber | model
  reported_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open | reviewing | resolved | dismissed
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
