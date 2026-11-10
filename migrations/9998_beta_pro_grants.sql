-- Operator-issued trial grants only. Not a purchase, entitlement backup or perpetual license.
-- Issue with a verified existing account UUID and a 30-day interval; do not create
-- public issuance endpoints or copy account-identifying values into Git.
CREATE TABLE IF NOT EXISTS beta_pro_grants (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_users(id),
 issued_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 created_at INTEGER NOT NULL,
 CHECK (expires_at > issued_at AND expires_at <= issued_at+30*86400)
);
CREATE INDEX IF NOT EXISTS beta_pro_grants_user_expiry ON beta_pro_grants(user_id,expires_at DESC);
