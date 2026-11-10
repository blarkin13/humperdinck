-- Owner-invited email allowlist. No unauthenticated invite tokens or public list.
-- Pending invitations expire 14 days after invitation; the 30-day Pro
-- entitlement starts only when the invitee signs in with their Google identity.
CREATE TABLE IF NOT EXISTS beta_invitations (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL COLLATE NOCASE,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 accepted_at INTEGER,
 accepted_user_id TEXT REFERENCES auth_users(id),
 revoked_at INTEGER,
 CHECK (expires_at > created_at AND expires_at <= created_at + 14*86400),
 CHECK (accepted_at IS NULL OR accepted_user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS beta_invitations_email_time ON beta_invitations(email,created_at DESC);
CREATE INDEX IF NOT EXISTS beta_invitations_expiry ON beta_invitations(expires_at);
