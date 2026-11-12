# Humperdinck account privacy and deletion — operator prelaunch runbook

**Status:** Privacy request intake and data export exist. Actual account
deletion remains disabled. A request for review is **not authorization** to
delete an account, revoke a Pro entitlement, or remove merchant records.

## Request intake and informed consequences

- `GET /api/account/privacy/export` returns owner account metadata and
  online Pro/device metadata, but not bearer tokens, recovery hashes or
  private signing keys.
- `POST /api/account/privacy/requests` requires an authenticated web
  session, same-origin request, and `REQUEST PRIVACY REVIEW`.
- A deletion *review* also requires explicit acknowledgement of potential
  loss of future online Pro activation, account-based recovery, and the fact
  that previously downloaded perpetual offline certificates may keep working.
- No automatic account deletion endpoint is implemented.
- The retained offline signed certificate cannot necessarily be revoked;
  do not promise remote erasure of files stored on the customer's computer.

## Operator-only review and retention

1. Independently verify identity, account ownership and exact request scope.
   Check pending deletion request and any disputes before proceeding.
2. Document a lawyer/accountant-approved retention policy with **specific**
   periods for merchant orders, refunds, chargebacks, invoices, tax evidence,
   access logs and user account data. Do not invent these periods.
3. Export the account and identify processors handling data; give the
   customer the current policy and request a final informed deletion choice.
4. Separately preserve legally necessary commerce order, refund, webhook and
   dispute records. Their staged schema is intentionally not a cascading
   child of the deletable auth user.
5. A customer who knowingly requests deletion **may forfeit the online Pro
   record, device activation and account-based recovery** subject to the
   final disclosed policy. The owner has not mandated preservation of a
   perpetual purchaser account for voluntary deletion.
6. Build a separate auditable, retry-safe, verified and explicitly approved
   operator workflow. Use a transaction or a compensating recovery plan,
   and verify how D1 foreign keys affect auth sessions, devices and grants.
   Do not use an ad hoc `DELETE FROM auth_users` in production.
7. Never delete based only on one privacy-request POST, a support email, a
   staging preflight, or a GitHub pull-request merge.
8. Maintain support/case records only as allowed by the final retention
   policy; avoid putting personal data or voice consent documents in logs.

`src/account-deletion-preflight.js` is an **internal read-only operator
review**: it requires an explicit operator flag, a retention approval
attestation, a pending deletion request, and no unresolved merchant dispute.
Its result always has `mayDelete: false`; it can never authorize deletion.

See [DATA_RETENTION_REGISTER.md](DATA_RETENTION_REGISTER.md) for the verified source-level record-class inventory and fields requiring owner/counsel-approved periods. Authentication expiration is not evidence that old database rows, merchant records or Cloudflare logs are automatically erased. Do not run ad hoc retention purges before reviewing dependencies, backups, holds and entitlement-recovery obligations.

## Remaining P0 acceptance

- [ ] Owner and counsel approve publication-ready policy and retention periods.
- [ ] Production D1 staged commerce migration and backup/restore are approved.
- [ ] Independently verify ownership and a final informed action per customer.
- [ ] Design and test separate destructive workflow, authorization, replay
      protection, audit, error handling and rollback.
- [ ] Test with customer-visible consequences and successful support workflow.
- [ ] Obtain explicit release approval before making deletion available.

Nothing in this runbook enables destructive requests.

## November 12 staged engineering implementation (PR #221)

- `src/account-deletion-operator.js` adds a **non-routed**, explicitly gated operator-only executor. It does not create any website/API deletion endpoint. `ACCOUNT_DELETION_EXECUTION_ENABLED` is **absent/off by default**, and must not be enabled without separate owner and legal signoff.
- Before any destructive attempt it demands a reviewed customer request ID, an independently verified final customer consent and 18+ policy/terms handling where relevant, explicit online Pro forfeiture and offline-certificate acknowledgments, an operator identity, approved retention policy version and confirmation that merchant evidence is preserved.
- Read-only preflight also blocks active legal/privacy holds, unresolved chargebacks, unsettled checkout intents, and linked beta invitations/grants/reports. This is intentional: database deletion alone cannot remove beta screenshot objects from R2. Accounts with beta records require a separate audited R2 and D1 cleanup plan.
- Staged migration 0009 creates an independent deletion audit and preservation-hold table, **not** a live deletion job. Both remain unapplied until change approval.
- In the isolated operator executor, D1.batch deletes a user and inserts a minimal non-cascading audit in one transaction; a failed audit is designed to roll back deletion. The user’s online Pro license, sessions, connection and recovery records cascade; commerce orders, refunds, webhook evidence and dispute ledgers do not.
- Synthetic integration tests in `tests/account-deletion-operator.test.mjs` cover explicit fail-closed settings, valid consent, cross-account boundaries, duplicate attempts, beta/chargeback/checkout/hold blockers, merchant survival and audited rollback. CI and runtime results must be checked before treating these as passed.
- **Retention values remain working targets** in `docs/RETENTION_SCHEDULE_IMPLEMENTATION_PROPOSAL_2026-11-12.md`, not a statutory determination or published policy.
- Before activating: confirm a reproducible *independent* final customer consent mechanism (not merely an operator boolean), account and merchant/legal hold reconciliation, actual D1 migration backup and restore, support access, customer notifications, beta R2 cleanup, full live-site privacy verification, production rollout/rollback, counsel review and separate explicit owner approval. No automatic account deletion or expiration purge is enabled.
