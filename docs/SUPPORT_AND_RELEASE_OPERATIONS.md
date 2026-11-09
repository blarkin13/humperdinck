# Humperdinck — Support intake and release operations

**Operational status: PARTIALLY VERIFIED (November 9, 2026).** This is the runbook for the *existing* Development Status P1 “Support and release operations” row. It does not approve a public release, deploy code, enable live payments, set a legally binding response-time promise, or authorize account deletion.

## Incoming contact addresses

| Customer purpose | Published address | Destination |
| --- | --- | --- |
| Installation, licensing, software problems | support@humperdinck.studio | Owner's verified Gmail inbox |
| Purchase, receipt, chargeback and refunds | billing@humperdinck.studio | Same inbox |
| Access, export, correction, retention, deletion review | privacy@humperdinck.studio | Same inbox |
| Copyright, speaker consent, impersonation and legal notices | legal@humperdinck.studio | Same inbox |

**Verified by read-only Cloudflare API, November 9:** domain active; all four routing rules enabled and forwarding to one verified Gmail destination; Cloudflare Email Routing MX, DKIM and SPF DNS values returned; catch-all disabled; suppression list count zero. This is *configuration evidence*, not an email-delivery guarantee.

**End-to-end delivery PARTIALLY VERIFIED:** A preliminary test sent from the destination Gmail account to `support@` appeared only in SENT and was inconclusive. A later, separate `Test` email addressed to `support@humperdinck.studio` appeared in the connected Gmail **INBOX** on November 9, 2026 (recipient preserved; no sensitive sender details retained here). Owner confirmed receipt. **Support forwarding PASS.** There is no equivalent received evidence yet for `billing@`, `privacy@`, or `legal@`. Do not mark all four aliases accepted.

### Alias acceptance evidence — November 9, 2026

| Alias | Routing configuration | Independent incoming message | Verified reply-from identity |
| --- | --- | --- | --- |
| support@humperdinck.studio | PASS | PASS — inbox message and owner confirmation | NOT TESTED |
| billing@humperdinck.studio | PASS | NOT TESTED | NOT TESTED |
| privacy@humperdinck.studio | PASS | NOT TESTED | NOT TESTED |
| legal@humperdinck.studio | PASS | NOT TESTED | NOT TESTED |

An enabled forwarding rule or a message in the **Sent** folder is not equivalent to a received-mail PASS. Do not publicly advertise a tested branded reply-from identity until that separate setup and test succeeds.

### Final delivery test (independent sender)

1. Using a mailbox **not** equal to the Gmail forwarding destination, send one harmless, unique-subject message to **each remaining unverified** alias address (billing, privacy, legal). Support already has incoming acceptance evidence. Include no customer PII or secret.
2. Inspect the recipient Gmail *Inbox* and *All Mail*, then Spam; confirm one incoming message for each alias, original `To:` alias, the independent `From:`, and approximate transit time. Do not confuse a SENT copy with receipt.
3. Reply only after determining whether the `From:` address can legitimately be the brand alias (Gmail “Send mail as” requires separate authenticated sender configuration); otherwise use the existing verified sending identity without misrepresenting it as an alias.
4. Save redacted evidence: alias, message subject marker, sent time, received time, disposition (inbox/spam), and verified response identity. Avoid full headers or source email addresses in the repository.
5. If delivery fails, inspect Cloudflare rule-enabled state, verified destination, MX routing, suppressions and provider Spam/filters. Do not disable DNS/email routing or change catch-all as a troubleshooting shortcut.
6. After all four independent-mailbox tests pass, the owner may accept operational inbox monitoring and handoff.

## Single-inbox triage procedure

Keep a simple confidential case ledger separate from GitHub source. Each case tracks a random case ID, arrival date, alias, generalized problem category, severity, current owner, next action, and closure result. Customer email addresses, recovery codes, purchase identifiers, exact local files and signed speaker-consent documents should **not** be committed to the repo.

- **Support:** platform (Windows/macOS/Linux), Humperdinck version, engine, approximate error, steps to reproduce, redacted logs with consent. Ask users not to send raw voice recordings unless truly necessary and explicitly authorized. Reproduce with synthetic/non-sensitive examples.
- **Billing:** ask only for the minimum information necessary to locate the purchase in the merchant portal; verify account ownership separately. Never ask for card number, payment CVV, password or recovery codes. Do not promise a refund the payment provider has not accepted.
- **Privacy:** confirm identity using the approved authenticated flow and follow `docs/ACCOUNT_PRIVACY_REQUEST_OPERATIONS.md`. A privacy-review request is **not** authorization to delete an account; preserve legally required commerce records.
- **Legal/consent:** restrict access to a designated owner; preserve reported links, scope and correspondence lawfully. Do not publish allegations, voice recordings or identities. Stop disputed Humperdinck-controlled publication if applicable, and obtain qualified advice for formal notices.

### Practical severity and escalation (internal triage, not public SLA)

- **SEV-1 — active compromise, accidental live charges, wrong-customer entitlement exposure, site-wide account failure:** stop affected rollout; preserve minimal evidence; notify owner immediately through an available channel; disable affected *feature only if authorized and reversible*. Protect users first. Never print secrets.
- **SEV-2 — many users affected, installer broken for a platform, paid Pro activation failing, widespread corrupt exports:** owner/engineer triage; isolate bad build/version; plan a controlled fix, release pause or reviewed rollback.
- **SEV-3 — reproducible individual failure or accessibility regression:** record steps, expected/observed behavior, affected version/OS and a redacted reproduction; route to development backlog.
- **SEV-4 — general how-to, enhancement, content clarification:** answer using tested docs; group duplicate requests.

Escalate suspected voice-consent misuse or privacy exposure to the owner; for legal deadlines, follow applicable notice requirements and qualified counsel advice rather than inventing deadlines. If an incident touches credit card processing, avoid investigating sensitive payment data outside the merchant's portal.

## Incident handling

1. **Detect and preserve:** capture UTC date/time, affected domain/build/version, sanitized symptoms, user-impact scope, available Cloudflare error counts, relevant GitHub release ID, and customer-provided descriptions with consent. Do not copy production signing keys or full tokens.
2. **Classify:** categorize as authentication, Pro entitlement, payment, privacy/consent, infrastructure, audio/render, installer/update or third-party outage. Assign severity and responsible operator.
3. **Contain safely:** freeze publishing; keep `src/live-commerce-release-gate.js` fail-closed and live checkout disabled. For an approved emergency response, prefer a targeted feature disable or known-good compatible deployment; no unapproved rollback or D1 restore.
4. **Investigate:** correlate redacted timestamps/version evidence and reproducible symptoms. Separate a Cloudflare Worker rollback from a D1 point-in-time restore; never assume a previous Worker version is schema-compatible.
5. **Recover with approval:** use `docs/WORKER_DEPLOYMENT_ROLLBACK_ACCEPTANCE.md`, `docs/D1_RECOVERY_ACCEPTANCE.md`, and `docs/PRO_SIGNING_KEY_RECOVERY_RUNBOOK.md` as appropriate. Record exactly what was approved, deployed, verified and whether recovery was rehearsed or real.
6. **Validate:** check public homepage/help/account, Google sign-in, download feed, version-appropriate Pro entitlement and test-only commerce denial. Validate physical installs on affected OS when possible; a CI pass alone is not a customer fix.
7. **Communicate and close:** provide affected customers a concise factual status and safe workaround where available, then record prevention/tests and redact/delete case data per the approved retention schedule.

## Desktop and website release checklist

**Before publishing**

- [ ] Identify release candidate exact source commit, version, target installer artifacts and GitHub Actions run; inspect pending PRs and beta P0 issues so no conflicting change is missed.
- [ ] Confirm actual rights and redistribution evidence for bundled software, models, samples, SFX and signed speaker permissions, or exclude unapproved assets. Refer to `docs/THIRD_PARTY_RELEASE_AUDIT.md` and `docs/RELEASE_RIGHTS_APPROVAL.json`.
- [ ] Verify source-level tests, signed updater artifacts and release integrity. `scripts/verify_distribution_live.py` confirms **currently published** GitHub release metadata/site feed, not new/unpublished version eligibility and not independently downloaded binary hashes.
- [ ] Obtain required independent exact-version-and-commit P0 and rights manifests. The `production` GitHub environment only enforces review when reviewers are actually configured.
- [ ] Run actual OS install, first launch, model download, voice generation/export, Pro backup and offline restoration checks on representative Windows, macOS and Linux devices. Record platform-specific caveats, including OS warnings for publisher-unsigned installers; do not claim notarization or Windows Authenticode without certificates.
- [ ] Confirm account, privacy and payment disclosures accurately match shipped functionality. Do **not** enable live checkout just because installers are ready or Lemon Squeezy test mode works.
- [ ] Confirm support alias delivery and operator monitoring; arrange a contingency contact if primary mailbox is unavailable.

**Publish only after authorization**

- [ ] Start the manual `Publish desktop installers (public distribution repo)` workflow from reviewed `main` with exact version and release notes. Do not alter its approvals or use a direct upload to bypass the gates.
- [ ] Ensure all three binaries, updater manifest/signatures and SHA256SUMS are present in `humperdinck-downloads`; publication must not overwrite an existing version.
- [ ] Read `https://humperdinck.studio/downloads.json` and `/updates/latest.json` to confirm expected version and approved URLs. Verify downloadable bytes/signatures and actual install on each platform; metadata checks alone are insufficient.
- [ ] If Cloudflare Worker code is deployed separately, associate the exact Git SHA with the observed Cloudflare Worker version and check the no-store deployment endpoint. Rehearse rollback only with a separately authorized safe candidate.
- [ ] Record link to release, UTC publication time, signed approvals, QA results, operator and emergency rollback or recovery plan; follow up on beta issues.

**After release**

- [ ] Check installation/download reports, login and entitlement failures, provider incidents, user-accessibility regressions and build/update error logs using minimal collected data.
- [ ] Review incoming support/billing/privacy/legal messages with a named owner. Customers should not be promised an unsupported response-time SLA.
- [ ] Reopen a previous issue if regression recurs; preserve precise OS/build test results and notes.
- [ ] Run a review of open support cases and any unresolved P0 incidents before the next release.

## Remaining acceptance for the P1 task

**Done:** documented intake routing, categories, priority scheme, incident containment and recovery paths, publishing preflight, production security interlocks and operator handoff; read-only DNS/routing check. **Support alias receipt PASS:** incoming mail received in Gmail inbox Nov 9 and owner confirmed. **Open:** independent sender → billing, privacy and legal aliases → verified receipt in Gmail; owner-defined mailbox-checking routine; safe customer reply identity verified; owner signoff for support coverage. Keep P1 open until those operational tests are documented.

No production changes, public emails to customers or live payment activation are performed by this document.
