-- Privacy requests are pending manual review; never silently delete lifetime entitlements.
CREATE TABLE IF NOT EXISTS auth_privacy_requests (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('access','deletion','correction')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','declined')),
 created_at INTEGER NOT NULL,
 completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS auth_privacy_owner_idx ON auth_privacy_requests(user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS auth_privacy_one_pending_kind_idx
 ON auth_privacy_requests(user_id,kind) WHERE status='pending';
