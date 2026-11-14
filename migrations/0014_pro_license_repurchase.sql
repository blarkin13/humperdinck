-- Allow a previous refunded/void Pro license to coexist with a later new sale.
-- Preserve historical licenses and registered devices exactly.
-- REQUIRE: backup + offline migration acceptance prior to production application.
-- Verified only pro_devices references pro_licenses in the current D1 schema.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE pro_devices_migration_backup AS
 SELECT id,license_id,installation_id,label,activated_at,last_seen_at,deactivated_at
 FROM pro_devices;
DROP TABLE pro_devices;

CREATE TABLE pro_licenses_migration_new (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','refunded','void')),
 issued_at INTEGER NOT NULL,
 max_devices INTEGER NOT NULL DEFAULT 10 CHECK (max_devices BETWEEN 1 AND 10),
 provider TEXT,
 purchase_ref TEXT UNIQUE
);
INSERT INTO pro_licenses_migration_new
 (id,user_id,status,issued_at,max_devices,provider,purchase_ref)
 SELECT id,user_id,status,issued_at,max_devices,provider,purchase_ref FROM pro_licenses;

DROP TABLE pro_licenses;
ALTER TABLE pro_licenses_migration_new RENAME TO pro_licenses;
CREATE INDEX pro_licenses_status_idx ON pro_licenses(status);
-- Only one CURRENT active license, but many archived void/refunded grants.
CREATE UNIQUE INDEX pro_licenses_active_user_idx ON pro_licenses(user_id)
 WHERE status='active';

CREATE TABLE pro_devices (
 id TEXT PRIMARY KEY,
 license_id TEXT NOT NULL REFERENCES pro_licenses(id) ON DELETE CASCADE,
 installation_id TEXT NOT NULL,
 label TEXT NOT NULL,
 activated_at INTEGER NOT NULL,
 last_seen_at INTEGER NOT NULL,
 deactivated_at INTEGER,
 UNIQUE (license_id,installation_id)
);
INSERT INTO pro_devices
 (id,license_id,installation_id,label,activated_at,last_seen_at,deactivated_at)
 SELECT id,license_id,installation_id,label,activated_at,last_seen_at,deactivated_at
 FROM pro_devices_migration_backup;
CREATE INDEX pro_devices_active_idx ON pro_devices(license_id,deactivated_at);
DROP TABLE pro_devices_migration_backup;
PRAGMA foreign_key_check;
