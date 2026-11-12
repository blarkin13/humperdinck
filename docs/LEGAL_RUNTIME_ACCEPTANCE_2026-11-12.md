# November 12, 2026 — P0 legal/deletion deployment acceptance evidence

This is a factual release-state log; it is **not legal sign-off** or customer-data deletion authorization.

## Completed
- Owner approval of retention operating targets recorded November 12, subject to qualified counsel/accountant review.
- PR #221 merged to `main` (squash `872e4f8dd09d2a7e22fab3d17880d7fb315272a3`): non-routed operator-only deletion; legal holds; recent typed final consent; transaction and independent audit; R2 beta cleanup with explicit partial-failure behavior; scheduled short-lived retention cleanup. Frontend and Python CI PASS.
- PR #223 merged to `main` (squash `8453fad69c1e0d33c1170174475d24ee289f38d6`): server-enforced 18+ OAuth signup; time/policy attestation evidence; account UI; legal notices. Frontend and Python CI PASS. Older draft PR #218 closed as superseded.
- Cloudflare D1 production schema received additive migrations 0008, 0009, 0010 after obtaining a prechange Time Travel bookmark. Verified the four new tables and four indexes exist. **No account deletion, purge or commerce ledger change occurred.**
- Latest inspected Cloudflare Worker deployment version `69c8a066-48cd-4d0d-b031-9d5fb4667cd2`, created November 12 at 20:52:01 UTC. Its bindings did **not** include `ACCOUNT_DELETION_EXECUTION_ENABLED`, `ACCOUNT_DELETION_CONFIRMATION_ENABLED`, `ACCOUNT_RETENTION_CLEANUP_ENABLED` or `ACCOUNT_DELETION_BETA_CLEANUP_ENABLED`. These features remain disabled.
- Cloudflare Browser Rendering reached homepage HTML and subsequently Account HTML. Deployed Account page includes `age18-confirm` and `deletion-final-confirmation` elements. The latter is hidden unless enabled by the backend. This verifies page content is serving, **not** that OAuth/business behavior was exercised.

## Pending to claim FULL launch acceptance
- Independent legal and merchant/accounting approval of applicable consumer, voice, privacy and tax/transaction retention language; see `docs/LEGAL_SINGLE_PASS_REVIEW_PACKET_2026-11-12.md`.
- Deployed, authenticated Google OAuth signup test for a new identity and a known existing identity. Confirm D1 age attestation is recorded only for new signups and no bypass exists.
- Privacy request/export/correction integration using an isolated synthetic account. Verify same-origin checks, final fresh-session consent, no unexpected side effects and case workflow.
- Isolated D1 end-to-end intentional deletion drill with real D1 transaction behavior, R2 screenshot reconciliation, legal holds, no cross-account mutation, signed offline certificate warning, and backup/restore. **Do not execute on a real customer.**
- Cloudflare browser/desktop processor and retention verification, including backup limitations, actual cache/log retention, and independent Safari/IPv4/IPv6 connectivity.
- Owner's explicit production enablement/release decision after preceding evidence is signed off. Do not set any destructive feature flags based on CI alone.

**Current decision:** Engineering source work merged and D1 schema ready; live full acceptance and independent legal review open. Do not close P0 Tasks 11 or 17 yet.
