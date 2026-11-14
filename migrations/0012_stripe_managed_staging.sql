-- Staged Stripe Managed Payments tables. No public checkout/webhook route is enabled.
-- Do not apply to production or populate with customer data until release acceptance.
CREATE TABLE IF NOT EXISTS commerce_stripe_intents (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 stripe_session_id TEXT UNIQUE,
 price_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents=4900),
 currency TEXT NOT NULL CHECK(currency='USD'),
 mode TEXT NOT NULL CHECK(mode='test'),
 status TEXT NOT NULL DEFAULT 'started' CHECK(status IN ('started','paid','cancelled','expired')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS commerce_stripe_intents_user_idx ON commerce_stripe_intents(user_id,created_at DESC);
-- Independent of deletable account identity: preserve merchant/dispute records.
CREATE TABLE IF NOT EXISTS commerce_stripe_orders (
 stripe_session_id TEXT PRIMARY KEY,
 stripe_payment_intent_id TEXT,
 stripe_event_id TEXT NOT NULL UNIQUE,
 intent_id TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents=4900),
 currency TEXT NOT NULL CHECK(currency='USD'),
 status TEXT NOT NULL CHECK(status IN ('paid','refunded','partially_refunded','disputed')),
 paid_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS commerce_stripe_orders_user_idx ON commerce_stripe_orders(user_id,paid_at DESC);
CREATE TABLE IF NOT EXISTS commerce_stripe_webhook_events (
 stripe_event_id TEXT PRIMARY KEY,
 stripe_session_id TEXT NOT NULL,
 body_sha256 TEXT NOT NULL CHECK(length(body_sha256)=64),
 event_type TEXT NOT NULL,
 processed_at INTEGER NOT NULL
);
