# Humperdinck beta feedback portal — secure rollout and operations

**Status: Implemented on a GitHub feature branch, not production-enabled.** Owner acceptance and security tests are required before receiving screenshots or personal data.

- Page: `https://humperdinck.studio/beta/`
- API: `/api/beta/reports` (authenticated GET/POST), `/api/beta/reports/:uuid` (GET; owner-only PATCH), and `/api/beta/reports/:uuid/screenshots` (POST, 3 PNG max, ≤2 MiB each).
- Screenshot retrieval: `GET /api/beta/reports/:uuid/screenshots/:uuid`; requires authenticated report submitter or owner. Never create a public R2 URL.
- Auth: existing web-session cookie with Worker-side validation; no anonymous and no desktop bearer session access. Authenticated owner review requires immutable `ANALYTICS_OWNER_ACCOUNT_ID` account UUID, not email.
- Feature flag: literal `BETA_FEEDBACK_ENABLED=1` is required. **Missing or any other value returns 404 to all beta APIs**, including admin.
- Storage: D1 `AUTH_DB` for feedback and metadata; private R2 `BETA_SCREENSHOTS` bucket. No customer uploads should be committed to GitHub.
- R2 bucket `humperdinck-beta-private` was created Nov 10, 2026; read-only check confirmed **zero custom domains** and **r2.dev disabled**. This proves no configured public bucket domain, not a full security assessment.

## Deployment sequence — do not change ordering

1. Review PR tests, external security, privacy notice, retention policy and responsible operator. Do not publish a beta invitation yet.
2. Apply **only** the new D1 migration `migrations/9999_beta_feedback.sql` through the project's existing migration approval flow, first to staging/local then production. Verify `beta_reports`, `beta_screenshots` indexes and database backup. No existing account tables are modified by this migration.
3. Confirm Worker R2 binding `BETA_SCREENSHOTS=humperdinck-beta-private` via `wrangler.jsonc`. Confirm no public R2 domain and no anonymous object access. Verify the bucket's geographic/data-retention handling is acceptable.
4. Deploy the reviewed Git SHA with **BETA_FEEDBACK_ENABLED unset**. Verify `GET /api/beta/reports` fails closed with 404, that the static `/beta/` shell loads, and that non-beta customer login/checkout and public releases remain unaffected.
5. Configure `ANALYTICS_OWNER_ACCOUNT_ID` to the verified owner user UUID through a secret/operator-controlled path, if not already set. Do not put credentials, IDs identifying a customer, or tokens in the repo. Owner authentication must not rely on email.
6. Establish approved consent/retention policy (see below). When signed off, enable `BETA_FEEDBACK_ENABLED=1` **only through the normal reviewed deploy/change-control path**.
7. Verify anonymous and desktop sessions receive 401; authenticated web tester can create and only read their own reports; owner can review all and change status. Post from an unrelated Origin must return 403. Invalid/malformed JPG/SVG/PNG or >2 MiB upload rejected; upload cap ≤3. Verify private screenshot cannot be read by another tester and returns `Cache-Control: no-store`.
8. Use only fictional text and a harmless test PNG without personal metadata. Confirm no public resource URL, no accidental GitHub issue attachment, no stored original filename and no worker logs containing report text. Test accessibility at 320/375/768px, keyboard and 200% zoom, then verify ordinary account and Web Analytics behavior.
9. Confirm person/operator to review reports each business day during the beta. Escalate blockers as sanitized `BETA-...` issues; never copy screenshots into GitHub.
10. Turn beta gate back off on abuse or privacy incident; preserve relevant evidence lawfully. The gate controls *access*, not historical data deletion.

## Operational privacy limits and owner decisions

The first version supports **only PNG** to avoid SVG script execution and reduce file-type attack surface. The handler validates PNG framing, chunk CRCs, critical image chunks, dimensions (max 4,096×4,096), and request size, and drops ancillary metadata chunks before storing the file. This is sanitization of metadata, **not full malware inspection or pixel re-encoding**; obtain a security review and assess image sanitization before accepting untrusted public uploads. Test screenshot files should be non-sensitive. PNG files can contain embedded metadata; warn contributors to remove personal/secret information.

The portal collects:
- Account user ID already present in the auth system (no new anonymous visitor identifier).
- User-supplied category, platform, feature area, summary, description.
- Optional screenshots and image dimensions, timestamps and review status.

It does **not** automatically capture voice data, scripts, full diagnostic logs, IP addresses, contact emails, payment details or device IDs in the feedback tables. Cloudflare security/network logs may independently process request metadata under normal provider operation. Existing account identity remains separately managed.

**Retention implemented but awaiting live acceptance:** Daily Cloudflare Worker cron `17 3 * * *` (03:17 UTC) calls `purgeOldBetaFeedback` to remove up to 50 reports older than **90 days**, deleting each report's R2 screenshot objects before their D1 metadata and text. New work/any other bucket is not scanned; the task is disabled unless the feature flag and bindings are present. Users can also DELETE their own reports and screenshots at any time; the owner can delete reports during privacy review. **Before enabling**, test the cron and delete path with fake D1/R2 data and an independent non-owner account; inspect Cloudflare cron history and D1 row removal. The cron is bounded (50 feedback reports per run), so verify that load is far below cleanup capacity and monitor failures. Cleanup continues even if new submissions are disabled, provided storage bindings exist. Backup snapshots may be retained under separately approved policies. Account deletion/privacy erasure must still consider linked beta records and R2 objects; do not enable destructive account deletion without integration testing.

**No notification emails yet:** owner reviews the private dashboard directly; the public portal does not send copies of reports to email or GitHub. Consider sanitized incident notification only after scope and consent/retention review.

## Acceptance checklist

- [ ] CI frontend security/syntax tests passed, D1 migration local/staging tested.
- [ ] Independent security and privacy review, including image processing and account removal.
- [ ] R2 bucket private and binding verified on deployed Worker.
- [ ] D1 migration accepted and production schema present.
- [ ] Owner UUID configured and permissions tested with two distinct accounts.
- [ ] Submission, three screenshots, invalid file and size, 4th screenshot, basic abuse/rate-limit tests.
- [ ] Private screenshot retrieval and no-store headers verified.
- [ ] Report deletion and 90-day daily cron verified in test/staging and approved, with backup retention disclosed.
- [ ] Public beta consent/help/privacy wording reviewed by owner.
- [ ] Mobile/keyboard/zoom/cross-browser QA passed.
- [ ] Flag enabled only after approval and independent beta users actually invited.

**Tracker row 36: IN PROGRESS until a real accessible and safe pilot is accepted, external testers participate, and results are documented.** This code by itself is not proof of buyer interest.

## Temporary 30-day Beta Pro — added November 10, 2026

**Purpose:** Permit invited testers to evaluate real Pro voice features without purchasing or creating an irrevocable lifetime grant.

1. Tester signs into their own existing Humperdinck Google account (the usual `/account/` sign-in).
2. The verified owner opens the `/beta/` private review panel, enters that tester's exact Google account email, and issues one 30-day invitation. This only works when the separately configured `BETA_PRO_ENABLED=1` and `BETA_FEEDBACK_ENABLED=1` flags are set.
3. The owner issuance API looks up an existing *Google* identity, stores the random grant UUID, associated account UUID, creation, issue and expiration times in `beta_pro_grants`, and rejects a second concurrent grant. It sends no promotional email automatically.
4. The tester connects that account in the desktop app and activates Pro. The Worker returns an Ed25519-signed `humperdinck.pro.beta` certificate with the exact 30-day expiry and the desktop's randomly generated installation ID.
5. The Python backend verifies the certificate using the pinned Pro verification keys, rejects installation-ID mismatches, and checks expiration **on each entitlement/status read**. It stores the beta certificate separately in `beta-license.json`. The permanent `pro-license.json`, purchase records and lifetime export remain untouched.
6. At expiration, that installation returns to **Free** without a purchase. An existing purchased perpetual certificate always takes precedence. Beta certificates cannot be exported/imported using the permanent Pro backup mechanism.
7. An owner can revoke future issuance through the beta panel. **Important limitation:** revocation cannot invalidate a previously issued *offline* beta certificate until its signed expiry. A deliberately changed system clock also weakens offline expiration; do not present beta access as tamper-proof DRM.
8. Do not grant access to anyone who has not agreed to the beta terms, authorized voice use and temporary expiry. Test with separate non-owner Google accounts before opening recruitment.

**Activation constraints:** The trial is intended to last exactly 30 days from issuance, not 30 days after first app use. Users with an existing desktop pairing may need to manually re-run Activate Pro. The trial is device-bound; pairing another installation uses the same account's unexpired grant to issue a separate device-bound certificate.

**Release gate:** Do not enable `BETA_PRO_ENABLED` until the beta signature/expiry tests, two-account owner access tests, production D1 migration, Worker/R2 binding and first real desktop activation check pass. Never insert trial rows into `pro_licenses`, never mint a `humperdinck.pro.perpetual` trial, and never grant permanent backup capability to a beta license.

**DB migration:** `migrations/9998_beta_pro_grants.sql` was applied to D1 with only schema/index creation; **zero grants** existed at verification. Cloudflare has an exact verified owner user ID configured in the `ANALYTICS_OWNER_ACCOUNT_ID` Worker secret (not embedded in code). The public feature flags remain disabled.

**Additional lifecycle:** Beta grant rows (distinct from paid purchase/entitlement records) are removed by the same daily cron 90 days after their expiration. Beta Pro issuance requires a separate explicit flag; turning off either flag does not convert temporary grants into lifetime purchases. Signed offline beta certificates can be locally checked until their expiration, after which the backend returns Free regardless of the online grant table.

## Invitation-only feedback security adjustment

The feedback POST endpoints require an **active, unrevoked beta invitation** (same 30-day grant), unless the user is the authenticated owner. Merely creating a Google account no longer permits screenshot uploads. Expired or revoked testers can still **read and delete their previous reports** while the portal is enabled. The browser hides the new-report form until an invitation is present. This ensures that owner-only reviewer operations and private R2 uploads are not exposed to all accounts.
