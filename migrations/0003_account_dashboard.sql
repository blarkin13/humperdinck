-- Customer dashboard: account connections, one-time recovery codes and safe identity linking.
-- Idempotent so this can be applied on an existing Humperdinck D1 database.
-- Connected desktops are voluntary anonymous installation IDs, never hardware fingerprints.
CREATE TABLE IF NOT EXISTS auth_connected_desktops (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE REFERENCES auth_sessions(token_hash) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  label TEXT NOT NULL,
  connected_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_connected_desktops_owner_idx
  ON auth_connected_desktops(user_id,connected_at);

-- Only keyed hashes are stored, never the recovery codes themselves.
CREATE TABLE IF NOT EXISTS auth_recovery_codes (
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,code_hash)
);

-- Linking a replacement sign-in provider requires a previously authenticated web session.
CREATE TABLE IF NOT EXISTS auth_link_intents (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_link_intents_expiry_idx
  ON auth_link_intents(expires_at);
