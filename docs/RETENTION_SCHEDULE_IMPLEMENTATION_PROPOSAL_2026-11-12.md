# Retention schedule — owner-directed implementation proposal (November 12, 2026)

**Status: ENGINEERING PROPOSAL — not legally approved, not active in production.** The owner asked to proceed with the remaining retention and deletion engineering. Previously suggested periods below are the working targets for implementation and legal/accounting review, **not** promises to customers or authorization to delete data. The Terms, Privacy Policy and internal register must not claim these are enforced until verified.

| Data class | Working target | Trigger / exception | Implementation gate |
| --- | --- | --- | --- |
| Account identity and linked providers | While account is active; eligible data within 30 days after verified deletion | Fraud/investigation/legal hold; transaction ledger is separate | No automatic deletion yet |
| Browser / desktop sessions | 30 / 90 day validity; expired D1 rows removed within a further 7 days | Revocation must take effect immediately | Independent scheduled cleanup, not merely opportunistic |
| OAuth/device/link challenges | 10 minute validity; expired D1 rows removed within 24 hours | Race/replay-safe expiry | Independent cleanup |
| Rate-limit hashes | 7 days maximum (normal operation) | Preserve only explicitly scoped incident evidence | Independent cleanup |
| One-time recovery hashes | While account active, until redeemed, rotated, or deleted | Recovery operation; no plaintext stored | Delete on verified account closure |
| Adult-eligibility evidence (staged) | While account active; delete with account unless lawful hold requires evidence | Record only 18+ assertion, policy version, timestamp; no DOB | Await age-migration rollout |
| Privacy request case metadata | 3 years after closure | Lawful hold, shorter applicable obligation or verified rights | Minimize personally identifying payload |
| Active lifetime Pro entitlement and device IDs | While online entitlement is active | Voluntary, knowingly confirmed account deletion forfeits online entitlement and online recovery; offline signed files cannot reliably be revoked | Two-step verified process only |
| Live order/refund/chargeback/tax ledger | Working planning assumption up to 7 years where applicable, **actual period jurisdiction- and merchant-dependent** | Longer lawful hold or other statutory requirement; merchant-of-record may have independent copies | Explicit merchant, lawyer and accountant determination before purge; no auto-delete |
| Test commerce | 90 days after test case closure, if unlinked to audit evidence | Keep documented regression fixture evidence and incident hold | Explicit sandbox-only job |
| Customer support cases | 2 years after closed | Legal complaints, active disputes or mandatory records | Restricted mailbox permissions; documented deletion |
| Optional diagnostics | 30 days after submission | Explicit opt-in, scrubber and withdrawal; not enabled for public collection | Keep off until implementation verified |
| Cloudflare logs/analytics/CDNs, third-party processors | Provider-specific: verify actual contract/settings; no fixed promise | Access/security exception and vendor-specific constraints | Audit production settings and data recipients first |
| Local voices, recordings, scripts and consent evidence | Device/user controlled | Backups and other parties' copies are outside cloud deletion | Verify file-lifecycle cleanup; no remote deletion guarantee |
| Production backups and exports | Proposed 30-day rolling deletion when technically supported | Legal holds; encrypted disaster recovery and integrity checks | Inventory every backup/processor location; recovery drill |

## Enforcement acceptance (must be evidenced, not inferred)

1. Before turning on a purge: distinguish TTL of an authentication credential from the actual physical deletion of its row; check foreign keys, restore points, legal holds, outstanding disputes and processor copies.
2. D1: use named/parameterized predicates only; first run a dry-run inventory with counts, fixed cutoff and sampled **non-PII metadata**; then compare transactionally after execution.
3. Do not purge tax, refund, purchase, chargeback or adult-consent records merely because their account is closed until the separate legal basis is documented.
4. Record versioned policy approval and deployment revision; do not silently apply a seven-year rule to every territory.
5. Delete private beta screenshot objects from R2 using an approved object deletion workflow; deleting a beta SQL row alone is insufficient.
6. Customer deletion must verify exact account, reauthentication, informed irreversible confirmation, live commerce holds, linked beta records, and independently retained ledgers. A request for *review* is not authority to destroy data.
7. For every release test expired sessions, missing/replayed consent, duplicate deletion, partial failures/rollback, unrelated-account isolation, merchant ledger survival, offline certificate warning and restoration from backups.
8. Do not deploy database migrations/purge jobs or enable destructive HTTP routes without separate production change approval. Qualified counsel/accountant review of applicable rights and periods remains mandatory.

See `docs/DATA_RETENTION_REGISTER.md`, `docs/ACCOUNT_PRIVACY_REQUEST_OPERATIONS.md`, `src/account-deletion-preflight.js`, and issues #132/#169.
