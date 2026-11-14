-- Future Stripe Managed Payments live ledger; NO HTTP routes or enabled payments.
-- Apply only during explicit release QA with backup and rollback.
CREATE TABLE IF NOT EXISTS commerce_stripe_live_intents (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 stripe_session_id TEXT UNIQUE,
 price_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents=4900),
 currency TEXT NOT NULL CHECK(currency='USD'),
 status TEXT NOT NULL CHECK(status IN ('started','paid','cancelled','expired')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS commerce_stripe_live_intents_user_idx
 ON commerce_stripe_live_intents(user_id,created_at DESC);
-- Independent of deletable login identities; retain only necessary payment evidence.
CREATE TABLE IF NOT EXISTS commerce_stripe_live_orders (
 stripe_session_id TEXT PRIMARY KEY,
 stripe_payment_intent_id TEXT UNIQUE,
 stripe_event_id TEXT NOT NULL UNIQUE,
 intent_id TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents=4900),
 currency TEXT NOT NULL CHECK(currency='USD'),
 status TEXT NOT NULL CHECK(status IN ('paid','refunded','partially_refunded','disputed')),
 paid_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS commerce_stripe_live_orders_user_idx
 ON commerce_stripe_live_orders(user_id,paid_at DESC);
CREATE TABLE IF NOT EXISTS commerce_stripe_live_events (
 stripe_event_id TEXT PRIMARY KEY,
 stripe_session_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 body_sha256 TEXT NOT NULL CHECK(length(body_sha256)=64),
 processed_at INTEGER NOT NULL
);
