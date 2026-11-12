-- Minimum adult-account attestation; no date of birth or identity documents.
-- Apply to D1 before deploying age-gated new account registration.
-- Existing accounts are not retroactively blocked; migration/reconfirmation
-- requires a separate published policy and owner decision.
CREATE TABLE IF NOT EXISTS auth_age_attestations (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 3 AND 64),
  attested_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_age_attestations_date_idx
  ON auth_age_attestations(attested_at);
