-- Xerelle v1 database schema

CREATE TABLE models (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  id_document_url TEXT,
  liveness_selfie_url TEXT,
  verified_at INTEGER,
  room_type TEXT NOT NULL DEFAULT 'standard',
  discoverable INTEGER NOT NULL DEFAULT 0,
  video_calls_enabled INTEGER NOT NULL DEFAULT 0,
  teaser_media_url TEXT,
  referred_by_model_id TEXT REFERENCES models(id),
  payout_bank_details TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_models_username ON models(username);
CREATE INDEX idx_models_referred_by ON models(referred_by_model_id);

CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE trial_messages (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  sent_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(subscriber_id, model_id)
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  status TEXT NOT NULL DEFAULT 'active',
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  current_period_end INTEGER NOT NULL,
  cancelled_at INTEGER,
  tier TEXT NOT NULL DEFAULT 'new_fan',
  UNIQUE(subscriber_id, model_id)
);

CREATE INDEX idx_subscriptions_model ON subscriptions(model_id);
CREATE INDEX idx_subscriptions_subscriber ON subscriptions(subscriber_id);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  amount_kobo INTEGER NOT NULL,
  model_share_kobo INTEGER NOT NULL,
  platform_share_kobo INTEGER NOT NULL,
  split_rate TEXT NOT NULL,
  payment_provider TEXT NOT NULL,
  payment_reference TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  retention_cleared_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_transactions_model ON transactions(model_id);
CREATE INDEX idx_transactions_subscriber ON transactions(subscriber_id);
CREATE INDEX idx_transactions_status ON transactions(status);

CREATE TABLE ppv_items (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  media_type TEXT NOT NULL,
  media_url TEXT NOT NULL,
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

CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  media_type TEXT NOT NULL,
  media_url TEXT NOT NULL,
  caption TEXT,
  posted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_stories_model_expiry ON stories(model_id, expires_at);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  sender_type TEXT NOT NULL,
  body TEXT,
  sent_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_messages_thread ON messages(subscriber_id, model_id, sent_at);

CREATE TABLE milestone_bonus_progress (
  model_id TEXT PRIMARY KEY REFERENCES models(id),
  qualifying_subscriber_count INTEGER NOT NULL DEFAULT 0,
  accrued_kobo INTEGER NOT NULL DEFAULT 0,
  withdrawable INTEGER NOT NULL DEFAULT 0,
  withdrawn_at INTEGER
);

CREATE TABLE referral_bonus_ledger (
  id TEXT PRIMARY KEY,
  referring_model_id TEXT NOT NULL REFERENCES models(id),
  referred_model_id TEXT NOT NULL REFERENCES models(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  amount_kobo INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_referral_ledger_referring ON referral_bonus_ledger(referring_model_id);

CREATE TABLE video_call_slots (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price_kobo INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE video_call_bookings (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES video_call_slots(id),
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  scheduled_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_type TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reported_type TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
