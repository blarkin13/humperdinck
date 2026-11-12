# P0 legal/consent/retention acceptance — November 12, 2026

Status: ENGINEERING CANDIDATE, NOT LAUNCH APPROVAL. This checklist is not legal advice, not counsel sign-off and not evidence of a production deployment. No destructive account deletion or live commerce enabled.

## Adult eligibility — owner decision recorded
- Owner selected **18+ accounts and Pro purchases** for launch (November 12). Teen accounts deferred; anonymous public browsing and Free offline desktop remain available.
- PR implementing /api/account/eligibility/confirm (same-origin POST, explicit statement, 10-minute signed HttpOnly cookie) and OAuth state-bound signup enforcement; Google and Apple share callback path.
- Migration 0008 provides minimum immutable registration evidence: account ID, age policy version and confirmation time; **never** date of birth, identity documents or secrets.
- Important: existing identities can sign in without retroactive lockout. Any reconfirmation rollout needs owner approval and specific customer notice.
- REQUIRED: apply migration 0008 to isolated D1 and production with rollback/read-only record checks **before** any rollout of age-gated new signup. Do not roll out this branch automatically or permit partially migrated signup.
- REQUIRED: regression in real Google OAuth on desktop/browser, Apple if enabled, tabs, retries, tampered/missing/expired age proof, CSRF, signup concurrency; verify first-time account records. Verify test results on actual PR before merge.
- REQUIRED: checkout routes / purchase intents / initial activation must reject ineligible accounts as appropriate; existing users need a separately reviewed transition policy. Do not treat a signed checkbox as independent third-party age verification.
- NOTE: checkbox text links Terms and Privacy; confirm actual clickthrough/accessibility and policy-version handling before activation.

## Account deletion / Pro forfeiture
- GitHub #132 and source currently accept authenticated privacy deletion **requests** only. The non-routed inspection function always reports mayDelete:false. THIS IS NOT COMPLETE.
- Test fixture in tests/account-deletion-retention.test.mjs already demonstrates online auth/license/device cascade and independently retained orders/refunds/webhook/dispute record rows; it does NOT authorize or demonstrate production deletion.
- Proposed intentional deletion: authenticated customer initiates, receives strong notice of forfeited online license, future activation and recovery, confirms a second time; pending financial dispute/legal hold blocks execution; online entitlement removed only once explicit reviewed policy has been approved. Previously exported offline certificates may remain functional.
- Preserve legally required merchant receipts, refunds, tax and dispute evidence outside deletable login rows; do not assume 7 years in every jurisdiction. Legal and accountant review required for specific durations, lawful basis and data minimization.
- Engineering acceptance required for separately feature-flagged audited operator workflow, idempotent retries, rollback of partial transactions, cross-account access refusal, deletion of session/recovery/privacy data within approved scope, retention-hold exclusions, and restore drills.
- No production destructive action or consent-retention schedule is authorized by this PR.

## Live policy/privacy verification
- Repository source reviewed: website/privacy, terms, cookies, voice-policy, license, refunds; account sign-in, account-privacy and owner runbooks. Source checks do not equal deployed browser tests.
- November 12 attempt to fetch public /privacy/, /terms/, /voice-policy/, /cookies/ and /account/ in external retrieval did not return reliable pages; /refunds/ was accessible, visibly marked pre-launch and disclosed one-time lifetime pricing, 10 activated devices, legally mandated refund exceptions and unapproved merchant identity. Do NOT mark other live pages VERIFIED.
- Required live anonymous network capture: home, public Studio, Google sign-in, optional Apple/passwordless if enabled, checkout disabled state, policies, legal/support links, Cloudflare Analytics, model CDNs, local storage and cookies. Capture no customer secrets.
- Required authenticated privacy flows using synthetic test account: export only own data; correction/access/deletion request origin, CSRF, one-pending semantics, duplicate/replay, offline certificate warnings, support manual processing and actual reply. Verify no deletion occurs.
- Required desktop checks on Windows/macOS/Linux for opt-in diagnostics OFF by default, local voice/source samples and consent evidence remain local, removable files actually cleaned and backup limitations accurately disclosed.
- Provider audits: Cloudflare edge/analytics retention, Google OAuth, Lemon Squeezy if approved, GitHub CDN, email forwarding/support archives and any other processor actually observed in browser traffic.

## Counsel and owner — not substitutable by CI
- Qualified lawyer reviews: Texas/U.S. and applicable selling territories, consumer terms, voice/right-of-publicity consent and indemnity, 18+ policy, customer rights/deletion, merchant/refund terms, arbitration/disputes, limitation of liability and privacy notices.
- Qualified accountant/merchant confirms actual tax, receipts, transaction retention and dispute holds. The owner must approve exact UNSET durations in DATA_RETENTION_REGISTER.md, including backup and archive periods.
- Must confirm legally usable contact methods and independently verify all customer-facing support aliases.
- Final reviewer records version/date, specific pages, approved policy periods and reservations. Preserve private evidence in restricted storage, not public GitHub.
- Keep P0 Terms, privacy, consent and retention OPEN until policy approved, real deployment and migration proven, destructive deletion process separately approved, and legal review recorded.
