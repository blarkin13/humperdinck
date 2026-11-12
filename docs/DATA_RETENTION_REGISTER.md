# P0 data retention and privacy-processing register — draft for owner/counsel approval

**Status:** Source-code and policy audit completed November 9, 2026. **NOT a legally approved retention schedule or a production data-deletion authorization.** Account deletion and live checkout remain disabled. Do not represent unapproved durations as promises, enable background deletion, or destroy purchase/consent records based on this register.

## Owner retention decision — November 12, 2026

The owner **approved the retention operating targets** in `docs/RETENTION_SCHEDULE_IMPLEMENTATION_PROPOSAL_2026-11-12.md` **subject to qualified legal and accounting review before enforcement**. This closes the owner-selection step but does **not** approve an exact statutory duration in every jurisdiction, authorize deletion, apply migrations, enable retention jobs, or establish that the technical erasure guarantees are implemented. The `UNSET` values in the observed schema inventory below remain historical implementation/legal-verification gaps, not a rejection of the approved targets. Do not close the P0 legal/deletion tasks until the remaining gates pass.

## Evidence and boundaries

- Reviewed `migrations/0001_accounts.sql` through `0007_live_disputes.sql` and proposed `0008_account_age_attestations.sql`, `src/account-auth.js`, `src/account-dashboard.js`, `src/account-privacy.js`, `src/account-deletion-preflight.js`, and `src/site-analytics.js`.
- The account Worker uses random IDs and hashed session/recovery material. Public Studio and optional third-party model/CDN connections still require a real browser/network review; code review alone cannot identify every storage item or processor.
- In authentication code, web sessions expire after **30 days**, desktop sessions after **90 days**, OAuth/device flows after **10 minutes**, and rate-limit buckets use a **10-minute** sliding window. These are functional expiry rules, **not** proof of complete historical erasure: cleanup runs opportunistically during relevant requests, and expired rows can persist when those requests do not occur.
- Analytics Engine's app event writer in `src/site-analytics.js` records enumerated event type, platform and source without user-submitted text, user-agent or IP at the application level. Cloudflare's platform-level processing and retention require separate confirmation.
- The published Cookie page must describe essential account cookies because account sign-in already exists. Cloudflare Web Analytics is a different service from essential sign-in cookies.

## Record-class decision register

| Record class / tables or local artifact | Observed purpose and present behavior | Approved duration | Action required before P0 closure |
| --- | --- | --- | --- |
| Adult eligibility confirmation / `auth_age_attestations` (migration 0008, schema applied November 12; runtime not deployed) | Policy version, timestamp and account ID for an expressly affirmed 18+ signup; no date of birth or ID document; signup flow proof cookie expires after 10 minutes | **UNSET** | Agree minimum evidence retention with qualified counsel; on verified deletion consider removing with account unless legal hold applies; production schema verified; live OAuth signup and final counsel review remain |
| Account profile / `auth_users`, `auth_identities` | Google account identity, name/email, profile and linked provider; no automatic deletion route | **UNSET** | Choose active-account retention, verified-request review and identity reconciliation; implement audited deletion only after approval |
| Browser and desktop sessions / `auth_sessions`, `auth_connected_desktops` | Hash of bearer token and optional installation label/ID. 30-day browser and 90-day desktop session validity; expiration rejection and opportunistic cleanup | **UNSET for storage after expiry** | Decide expired-record cleanup cadence and verify linked desktop cascading; preserve revocation audit only when necessary |
| OAuth/link/device challenges / `auth_flows`, `auth_device_flows`, `auth_link_intents` | Ten-minute OAuth/device validity; link-intent expiry enforced and opportunistically purged | **UNSET for storage after expiry** | Add safe independent cleanup or scheduled lifecycle once approved; test concurrency, replay and rollbacks |
| Security rate limits / `auth_rate` | Secret-keyed hash of IP and action with ten-minute rolling window; no raw IP stored in this table | **UNSET for storage after expiry** | Confirm purge behavior, Cloudflare edge/security log retention and whether incident exceptions are needed |
| One-time recovery / `auth_recovery_codes` | Only keyed hashes; no time-based expiry in schema; replaced/used on user action | **UNSET** | Choose recovery-code rotation and invalidation policy and document lost-account recovery without unnecessarily storing secrets |
| Privacy requests / `auth_privacy_requests` | Pending manual access/correction/deletion review with request ID, status and timestamps; no automatic destruction | **UNSET** | Decide case closure, legal hold and case history retention, restrict access, and test correction/access fulfillment |
| Pro entitlement and device records / `pro_licenses`, `pro_devices` | Lifetime license, random installation IDs, device count and potential offline signed certificate | **UNSET, must reconcile lifetime obligation** | Approve entitlement/recovery minimum data and deletion forfeiture consequences; cannot guarantee revocation of exported signed offline certificates |
| Test checkout / `commerce_test_*` | Separate test-only checkout intents, orders and deduplicated webhook hashes | **UNSET** | Choose safe sandbox purge process (not production) and keep test-only entitlements isolated |
| Live purchases/refunds/disputes / `commerce_live_intents`, `commerce_live_orders`, `commerce_live_webhook_events`, `commerce_live_disputes`, `commerce_live_dispute_events` (migrations staged, not live) | Minimum order/intents/webhook/dispute identifiers, amount/currency/status, references; order/dispute evidence deliberately independent of deletable login records | **UNSET — merchant/accountant/counsel decision** | Confirm applicable tax, accounting, payment and consumer law periods; preserve legal holds; define limited access, minimization and verified deletion after term |
| Hosted website, analytics and Cloudflare logs | Web Analytics, server requests, security events, model/CDN connections; individual provider settings not verified here | **UNSET / provider dependent** | Inspect production network, Cloudflare retention/settings, processors, user notices and access policy |
| Optional desktop diagnostics | Intended opt-in and off by default; processor/upload pipeline, scrubber and retention not accepted | **NOT APPROVED / NOT ENABLED** | Do not collect until fields, consent/withdrawal, processor, scrubber, deletion and retention are implemented and tested |
| Local voice projects, uploaded samples and consent evidence | Locally stored voice and speaker-signed PDF/image evidence with checksum as described in current policy; records remain outside hosted account datastore | **Device/user controlled; verify code paths** | Test source-sample cleanup after saving, deletion of voice-linked consent file, user backups and limits of remote deletion; do not promise removal of independent copies |
| Support/privacy/legal correspondence | Forwarded aliases, confidential inbox/case records with possible identifiers and legal complaints | **UNSET** | Adopt case triage/access rules, minimum redaction, deadline/hold handling and deletion controls; independently verify remaining alias delivery |

## Required owner/counsel decisions

1. Approve *specific* duration or event-based trigger for every **UNSET** class, including backups, archives, processor-held copies, legal holds and requests from minors.
2. Determine seller/merchant of record, final consumer remedies, applicable jurisdictions, privacy rights, notice address and legally necessary billing/tax/dispute retention. Consult qualified counsel/accountant rather than guessing multi-jurisdiction periods.
3. Approve account-deletion online Pro forfeiture language and independently verify a deliberate customer choice; preserve merchant records where legally required. A previously exported offline certificate may still work.
4. Decide support case response owners, secure record access, request verification and deletion/appeal procedure.
5. Approve privacy notices based on *deployed* browser/desktop traffic, not source assertions, and confirm age restrictions on all authentication entrypoints.

## Implementation acceptance and safeguards

- [x] Source inventory above with explicit unknowns and operational expiry/erasure distinction.
- [x] No destructive route is turned on; `src/account-deletion-preflight.js` always returns `mayDelete:false`.
- [ ] Independently exercise actual production browser/CDN/cookie flows, account registration and desktop diagnostics, with no customer secrets captured.
- [ ] Owner and counsel approve retention values, notices, signed voice consent and consumer terms; update public pages to match.
- [ ] Engineer scoped purge/reconciliation jobs only after policies are approved, with dry runs, backups, referential-integrity tests, auditability and legal-hold exclusions.
- [ ] Independently test access/export/correction/deletion review, customer-visible consequences, multi-device and offline restore behavior.
- [ ] Verify purchased-license entitlement and merchant ledgers survive or are minimized in accordance with the approved policy; do not casually cascade commerce records.
- [ ] Obtain exact release sign-off and record deployment/CI acceptance in Development Status.

Related: `docs/LEGAL_LAUNCH_REVIEW.md`, `docs/ACCOUNT_PRIVACY_REQUEST_OPERATIONS.md`, `docs/SUPPORT_AND_RELEASE_OPERATIONS.md`, and Development Status P0 "Terms, privacy, consent and retention".
