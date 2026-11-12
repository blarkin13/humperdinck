-- Account deletion execution is an independently gated operator-only workflow.
-- A release/merge NEVER enables deletion; the Worker has no public deletion route.
-- Keep minimal non-PII audit evidence after auth_users deletion; preserve merchant ledgers.
CREATE TABLE IF NOT EXISTS auth_deletion_holds (
 user_id TEXT NOT NULL,
 hold_id TEXT NOT NULL,
 reason_code TEXT NOT NULL CHECK(reason_code IN ('legal','fraud','chargeback','privacy_dispute')),
 created_at INTEGER NOT NULL,
 released_at INTEGER,
 PRIMARY KEY(user_id,hold_id)
);
CREATE INDEX IF NOT EXISTS auth_deletion_holds_active_idx
 ON auth_deletion_holds(user_id) WHERE released_at IS NULL;
CREATE TABLE IF NOT EXISTS auth_deletion_audit (
 request_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 policy_version TEXT NOT NULL,
 operator_id TEXT NOT NULL,
 completed_at INTEGER NOT NULL,
 online_pro_forfeiture_acknowledged INTEGER NOT NULL CHECK(online_pro_forfeiture_acknowledged = 1),
 offline_certificate_limitation_acknowledged INTEGER NOT NULL CHECK(offline_certificate_limitation_acknowledged = 1)
);
CREATE INDEX IF NOT EXISTS auth_deletion_audit_by_user
 ON auth_deletion_audit(user_id,completed_at);
