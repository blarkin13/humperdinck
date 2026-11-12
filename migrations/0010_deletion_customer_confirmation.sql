-- Final deletion consent is distinct from a privacy REVIEW request.
-- This does not activate account deletion; HTTP consent route remains gated.
-- Store only an acknowledgment code and short-lived timestamps, not raw prose.
CREATE TABLE IF NOT EXISTS auth_deletion_confirmations (
 request_id TEXT PRIMARY KEY REFERENCES auth_privacy_requests(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 policy_version TEXT NOT NULL,
 confirmed_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 CHECK(expires_at>confirmed_at AND expires_at<=confirmed_at+600)
);
CREATE INDEX IF NOT EXISTS auth_deletion_confirmation_owner_idx
 ON auth_deletion_confirmations(user_id,expires_at);
