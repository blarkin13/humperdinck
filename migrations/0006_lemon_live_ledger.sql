-- Staged live-commerce ledger. This migration is NOT applied to production by merging.
-- No HTTP route uses these tables until merchant, retention and release approval.
CREATE TABLE IF NOT EXISTS commerce_live_intents (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 store_id TEXT NOT NULL,
 variant_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
 currency TEXT NOT NULL CHECK(length(currency)=3),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'started'
   CHECK(status IN ('started','paid','cancelled','expired','refunded'))
);
CREATE INDEX IF NOT EXISTS commerce_live_intents_user_idx
 ON commerce_live_intents(user_id,created_at DESC);

-- Retain the minimum purchase ledger independently of deletable login identity.
-- Retention/deletion policy still requires owner/legal approval.
CREATE TABLE IF NOT EXISTS commerce_live_orders (
 provider_order_id TEXT PRIMARY KEY,
 intent_id TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
 currency TEXT NOT NULL CHECK(length(currency)=3),
 status TEXT NOT NULL CHECK(status IN ('paid','refunded','partially_refunded','disputed')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS commerce_live_orders_user_idx
 ON commerce_live_orders(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS commerce_live_webhook_events (
 body_sha256 TEXT PRIMARY KEY CHECK(length(body_sha256)=64),
 provider_order_id TEXT NOT NULL,
 event_name TEXT NOT NULL CHECK(event_name IN ('order_created','order_refunded')),
 processed_at INTEGER NOT NULL
);
