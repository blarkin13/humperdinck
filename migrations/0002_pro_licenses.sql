-- Permanent Humperdinck Pro grants and voluntary online device registrations.
-- Actual purchases/issuance are deliberately NOT exposed by public API.
-- Clients receive a signed owner certificate with NO expiry; server status
-- and deactivation do not revoke previously exported offline certificates.
CREATE TABLE IF NOT EXISTS pro_licenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','refunded','void')),
  issued_at INTEGER NOT NULL,
  max_devices INTEGER NOT NULL DEFAULT 10 CHECK (max_devices BETWEEN 1 AND 10),
  provider TEXT,
  purchase_ref TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS pro_licenses_status_idx ON pro_licenses(status);

CREATE TABLE IF NOT EXISTS pro_devices (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES pro_licenses(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  label TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  deactivated_at INTEGER,
  UNIQUE (license_id,installation_id)
);
CREATE INDEX IF NOT EXISTS pro_devices_active_idx
  ON pro_devices(license_id,deactivated_at);

-- D1 migration tracking is done by Wrangler when applied with migrations.
