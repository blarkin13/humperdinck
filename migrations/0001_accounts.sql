-- Humperdinck optional user accounts. No user account required for Free.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_identities (
  provider TEXT NOT NULL CHECK (provider IN ('google','apple')),
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider,subject)
);
CREATE INDEX IF NOT EXISTS auth_identities_user_idx ON auth_identities(user_id);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('web','desktop')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_flows (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  return_path TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_device_flows (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  challenge TEXT NOT NULL,
  user_id TEXT REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_device_expiry_idx ON auth_device_flows(expires_at);
CREATE TABLE IF NOT EXISTS auth_rate (
  bucket TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_bucket_idx ON auth_rate(bucket,created_at);
