-- Operator-reviewed dispute evidence ledger. Unapplied; no public API route.
-- Lemon Squeezy does not document a dedicated chargeback webhook (2026-11-09).
-- Record ONLY a merchant-verified reference, never card data or evidence files.
CREATE TABLE IF NOT EXISTS commerce_live_disputes (
 provider_case_id TEXT PRIMARY KEY,
 provider_order_id TEXT NOT NULL REFERENCES commerce_live_orders(provider_order_id),
 status TEXT NOT NULL CHECK(status IN ('open','won','lost')),
 evidence_source TEXT NOT NULL CHECK(evidence_source IN ('merchant_dashboard','merchant_support')),
 evidence_reference TEXT NOT NULL,
 operator_id TEXT NOT NULL,
 observed_at INTEGER NOT NULL CHECK(observed_at > 0),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS commerce_live_disputes_order_idx
 ON commerce_live_disputes(provider_order_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS commerce_live_dispute_events (
 provider_case_id TEXT NOT NULL REFERENCES commerce_live_disputes(provider_case_id),
 status TEXT NOT NULL CHECK(status IN ('open','won','lost')),
 observed_at INTEGER NOT NULL CHECK(observed_at > 0),
 PRIMARY KEY (provider_case_id,status,observed_at)
);
