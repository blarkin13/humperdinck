-- Isolated, non-commercial Lemon Squeezy test checkout ledger.
-- IMPORTANT: test orders NEVER grant an entitlement in pro_licenses.
CREATE TABLE IF NOT EXISTS commerce_test_intents (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'started' CHECK(status IN ('started','paid','refunded')),
 checkout_id TEXT
);
CREATE INDEX IF NOT EXISTS commerce_test_intents_user_idx ON commerce_test_intents(user_id,created_at);

CREATE TABLE IF NOT EXISTS commerce_test_orders (
 provider_order_id TEXT PRIMARY KEY,
 intent_id TEXT NOT NULL UNIQUE REFERENCES commerce_test_intents(id),
 user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 order_number TEXT,
 amount_cents INTEGER NOT NULL DEFAULT 0,
 currency TEXT NOT NULL DEFAULT 'USD',
 status TEXT NOT NULL CHECK (status IN ('paid','refunded','partially_refunded')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS commerce_test_orders_user_idx ON commerce_test_orders(user_id,updated_at);

-- Event body signatures provide transport-level deduplication. No raw payloads,
-- billing details, card data or webhook secrets are stored in this ledger.
CREATE TABLE IF NOT EXISTS commerce_test_webhook_events (
 body_sha256 TEXT PRIMARY KEY,
 provider_order_id TEXT NOT NULL,
 event_name TEXT NOT NULL CHECK(event_name IN ('order_created','order_refunded')),
 processed_at INTEGER NOT NULL
);
