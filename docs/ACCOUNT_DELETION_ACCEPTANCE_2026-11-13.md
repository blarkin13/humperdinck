# Account deletion — owner decisions and safety acceptance (2026-11-13)

## Owner decisions
- Present a clear account-deletion confirmation **dialog** with **Accept** and **Cancel**, not an ambiguous one-click delete.
- The warning explains that *actual deletion* permanently forfeits online lifetime Pro, online activations, connected devices and recovery. Previously downloaded signed offline certificates may continue operating and cannot be remotely revoked.
- Do not use the dialog alone as permission to delete: the customer first requests a review, and the optional final stage still requires a recent signed-in web session, exact typed phrase `DELETE MY HUMPERDINCK ACCOUNT`, both acknowledgments, exact request/policy and ten-minute expiry. Cancel/Escape does not record acceptance.
- **Keep required financial records in the existing independently retained database tables**: paid order and tax-relevant amount/currency evidence, order-refund webhook history, merchant dispute and event records and durable deletion audit. Removing the user's login must not cascade into these independent ledgers. Transient authorization/session/device data and unnecessary user account data are not held indefinitely. This does **not** mean keeping every user record despite a valid erasure request.

## Engineering evidence
- PR #228: native accessible Accept/Cancel confirmation (both review and final-consent stages), clear Pro/backup/financial warnings, responsive styles and modal behavior tests.
- Existing PR #221: non-routed default-disabled operator executor, mandatory independent customer consent, legal holds, unsettled checkout and beta-linked data blockers, deletion+audit in one D1.batch transaction, merchant-record preservation.
- Realistic isolated SQLite fixture, foreign keys ON: two synthetic customers each with Pro, sessions, device, independent orders, webhook history and dispute evidence. Only the consenting customer loses login, devices and online Pro; the unrelated customer and both merchant ledgers remain intact.
- Explicitly test a refunded order/refund event, audit-write failure rollback, an invalid/mismatched or expired consent, legal holds, unresolved checkout/disputes, and R2 screenshot cleanup that preserves another customer's object.
- Dedicated `.github/workflows/account-deletion-acceptance.yml` executes these tests on PRs and main; `frontend-build.yml` also runs the modal and deletion executor tests.
- An **isolated separate Cloudflare D1 test database** `humperdinck_deletion_acceptance_20261113` was created with production-equivalent migrations and two fabricated accounts. Schema and fixtures loaded successfully; a direct destructive D1 API test was blocked by tool safety restrictions. **Do not represent the isolated D1 deletion transaction as tested.** No production user data was used or deleted. After the schema/fixture verification, the isolated synthetic test database was explicitly deleted through the Cloudflare API; no extra D1 database or persistent test customer remains.

## Still required for live account deletion
- A qualified legal/accounting review of applicable rights, mandatory retention and the Pro/forfeiture language, or documented owner acceptance of applicable risks; this is not a claim that the law universally requires legal signoff.
- Authenticated operator release mechanism with immutable audit, two-person/hold controls as appropriate, and successful end-to-end Cloudflare D1 + R2 tests and backup/restore with **synthetic** data.
- Explicit production-release decision before setting `ACCOUNT_DELETION_EXECUTION_ENABLED` or `ACCOUNT_DELETION_BETA_CLEANUP_ENABLED`. No public HTTP delete endpoint exists; do not set these flags based on modal tests alone.
- Verify exact code/asset deployment and current consumer-facing Terms/Privacy before saying customers can delete accounts.

**Status:** owner modal and isolated safety-test engineering complete on PR #228; production customer deletion remains disabled until the release acceptance above.
