# Humperdinck — one-pass legal and production release sign-off packet

**Status: ready for independent legal/accounting review, NOT legally approved.** Prepared November 12, 2026. This packet consolidates the remaining launch decisions so reviewers can work in one pass. No professional legal opinion is represented here.

## Product and operator
- Humperdinck is a local-first AI voice/narration application operated by a Texas sole proprietor. Domain: humperdinck.studio.
- Minimum user/account and Pro purchase age: **18+**. Anonymous site browsing and Free local functions need no account. The age gate captures an affirmative statement (not government ID or verified date of birth).
- New users may sign in with supported OAuth providers; identity, session, privacy requests, age attestation and minimal installation identifiers are held in Cloudflare D1.
- Pro license: one-time lifetime purchase, ten device registrations, offline signed backup, account required to initially activate. No automatic cloud upload of recordings or scripts; third-party model downloads and diagnostics must be disclosed accurately.
- Voice cloning: require prior signed speaker authorization, restrict nonconsensual voice replication, and disclose realistic technical inability to prevent every misuse. Consider rights of publicity, copyright, biometrics, and enforceability of indemnity/disclaimers in applicable markets.
- Planned free/paid status and checkout are governed separately; do not represent live payments as approved before merchant finalization.

## Policies for focused review
Review final customer-visible versions of:
- `website/terms/index.html`
- `website/privacy/index.html`
- `website/license/index.html`
- `website/voice-policy/index.html`
- `website/refunds/index.html`
- `website/cookies/index.html`
- `website/copyright/index.html`
- `docs/RETENTION_SCHEDULE_IMPLEMENTATION_PROPOSAL_2026-11-12.md`
- `docs/DATA_RETENTION_REGISTER.md`
- `docs/ACCOUNT_PRIVACY_REQUEST_OPERATIONS.md`

## Owner-approved retention operating targets
The owner approved the draft schedule on November 12, 2026, **subject to applicable legal/accounting review before enforcement**. Proposed: 30-day processing window for eligible verified account deletion; web/desktop session credential validity 30/90 days and expired-row erasure grace of 7 days; OAuth/device/link expiry at 10 minutes and row removal within a day; security hashes up to seven days; privacy request metadata three years after closure; support correspondence two years after closure; opt-in diagnostic logs 30 days; test commerce 90 days after test closure; backups rolling 30 days where supported. Purchase/tax/refund/dispute evidence remains separately retained while legally necessary; seven years is only an assumption where applicable, **not** a universal statutory period. Voice/source/signed consent files remain local and subject to the customer's own backups.

## Customer account deletion policy
- Privacy deletion *review request* is not final consent.
- A separate final step requires recent sign-in, exactly typed irreversible-deletion phrase, Pro forfeiture and offline-certificate warnings, specific pending request ID and policy-version-bound consent that expires after 10 minutes.
- An operator must verify the signed-in customer and legal holds, unsettled checkout, disputes and beta data; tests confirm third-party/account isolation.
- On intentional deletion, authentication identities, online Pro entitlement, device registrations, active sessions and linked account records are removed; online activation and recovery are permanently forfeited subject to final written Terms. Previously exported signed perpetual offline files may continue functioning.
- Independent minimum merchant receipts/refunds/chargeback/tax evidence is preserved. An audit record survives deleted login identity.
- Beta screenshot files require R2 deletion and linked D1 cleanup first; Cloudflare R2 is not transactionally coupled with D1. A recovery/reconciliation runbook is necessary for partial failures.

## Engineering evidence and safety
- PR #221 merged: non-routed transactional deletion and D1 audit, legal holds, linked beta preparation, explicit customer consent stage and scheduled short-lived auth cleanup. Automated CI passed.
- PR #223 integrates age-18 new-account gate with the current code. Production D1 tables for migrations 0008, 0009, 0010 were created and verified as present; no account data was deleted as part of these migrations.
- Actual destructive account deletion, final consent intake and short-lived retention cleanup are controlled by separate feature flags, deliberately OFF pending release acceptance.
- Source-level test results cannot substitute for live browser and D1 end-to-end acceptance. The hostname had a Safari connection failure; verify public pages, HTTPS, OAuth and customer workflows from normal external networks before public launch.
- A qualified lawyer/accountant must determine jurisdictional privacy rights, merchant-of-record tax/data retention, mandatory consumer remedies, voice authorization and enforceability of contractual provisions. Payment processor practices may require changes.
- Privacy/support aliases, processors, backup/restore, session expiration, data exports and deletion of R2 objects must be verified and documented.

## Reviewer disposition (to be completed by an actual reviewer)
- Reviewing lawyer / jurisdiction / license number: **PENDING**
- Accounting/merchant retention reviewer: **PENDING**
- Policy version(s) approved, with specific required edits: **PENDING**
- Signed voice consent / right-of-publicity approval: **PENDING**
- Deletion/customer-rights and Pro forfeiture approval: **PENDING**
- Consumer refund/payment and tax-record periods: **PENDING**
- Data processor, diagnostics, backups and retention exception approval: **PENDING**
- Owner final release sign-off after deployed testing: **PENDING**

**No legal review has occurred merely because this packet exists.** Do not enable irreversible production deletion or claim final launch approval until independent review and actual runtime tests are documented.
