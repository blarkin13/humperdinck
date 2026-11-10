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

The first version supports **only PNG** to avoid SVG script execution and reduce file-type attack surface. The handler checks PNG signatures, IHDR, dimensions (max 8,000×8,000), IEND and request size. This is basic validation, **not full malware inspection or pixel re-encoding**; obtain a security review and assess image sanitization before accepting untrusted public uploads. Test screenshot files should be non-sensitive. PNG files can contain embedded metadata; warn contributors to remove personal/secret information.

The portal collects:
- Account user ID already present in the auth system (no new anonymous visitor identifier).
- User-supplied category, platform, feature area, summary, description.
- Optional screenshots and image dimensions, timestamps and review status.

It does **not** automatically capture voice data, scripts, full diagnostic logs, IP addresses, contact emails, payment details or device IDs in the feedback tables. Cloudflare security/network logs may independently process request metadata under normal provider operation. Existing account identity remains separately managed.

**Retention decision required before enabling:** recommend automatically deleting report text and screenshot objects after 90 days (or after issue closure plus a defined shorter period), with a verified data deletion workflow and backups policy. The current PR does not implement scheduled deletion, and the page should **remain disabled** until actual automated retention or an owner-accepted documented interim manual deletion method is in place. A bucket lifecycle rule alone does not remove the D1 metadata. Account deletion/privacy erasure must consider linked beta records and R2 objects; do not enable destructive account deletion while these tables would be orphaned.

**No notification emails yet:** owner reviews the private dashboard directly; the public portal does not send copies of reports to email or GitHub. Consider sanitized incident notification only after scope and consent/retention review.

## Acceptance checklist

- [ ] CI frontend security/syntax tests passed, D1 migration local/staging tested.
- [ ] Independent security and privacy review, including image processing and account removal.
- [ ] R2 bucket private and binding verified on deployed Worker.
- [ ] D1 migration accepted and production schema present.
- [ ] Owner UUID configured and permissions tested with two distinct accounts.
- [ ] Submission, three screenshots, invalid file and size, 4th screenshot, basic abuse/rate-limit tests.
- [ ] Private screenshot retrieval and no-store headers verified.
- [ ] Report deletion and retention policy implemented/approved.
- [ ] Public beta consent/help/privacy wording reviewed by owner.
- [ ] Mobile/keyboard/zoom/cross-browser QA passed.
- [ ] Flag enabled only after approval and independent beta users actually invited.

**Tracker row 36: IN PROGRESS until a real accessible and safe pilot is accepted, external testers participate, and results are documented.** This code by itself is not proof of buyer interest.
