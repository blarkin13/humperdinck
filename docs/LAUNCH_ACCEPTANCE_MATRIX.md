# Release acceptance matrix — Humperdinck (November 8, 2026)

Status labels: CODED / DEPLOYED / CI PASS / HUMAN VERIFIED / BLOCKED / NOT DONE.
CI PASS must never be substituted for HUMAN VERIFIED on named physical hardware.

## P1 — Free and Pro licensing

| ID | Scenario | Expected result | Evidence |
| --- | --- | --- | --- |
| ENT-01 | Fresh offline install, no account | Free Narration, Video, Sounds, Voice Library and supported exports available | OS/version, screen recording, saved audio file |
| ENT-02 | Free user tries personal Qwen VoiceDesign, custom reference clone or saved Qwen identity via UI and direct API | Denied server-side; curated approved built-in references not blocked | HTTP responses + UI |
| ENT-03 | Free user previews gallery then tries downloading community package | Preview permitted; community download denied | HTTP + UI |
| ENT-04 | Valid paid Pro owner's desktop activates on account | Signed portable certificate issued only to paid account | Provider reference (redacted), signed certificate verification |
| ENT-05 | 8, 10 and 11 distinct online installations | Warnings at 8/10; 11th denied; same UUID reactivation not double counted | D1 counts + client statuses |
| ENT-06 | Parallel activation from two new devices at 9 slots | Cannot register more than 10 devices; verify D1 concurrent behavior | 20+ repeat runs; D1 count |
| ENT-07 | Deactivate one slot; reinstall with same saved user data | One slot freed; machine retains random installation ID where preserved | D1 plus local storage |
| ENT-08 | Backup license, disconnect permanently, uninstall/reinstall, restore on another computer | Valid untampered license continues Pro without network; no hardware fingerprint | Airplane mode and fresh profile |
| ENT-09 | Invalid signature, wrong key, expired online session, no license | No privilege escalation; original authentic offline Pro not revoked by sign-out | Redacted logs |
| ENT-10 | Simulated permanent service shutdown | Installer, downloaded models and offline backed-up Pro are usable independently | Isolated test network |

Automated baseline: `tests/pro-license.test.mjs`, `tests/test_pro_license.py`, `tests/test_api.py`. Remaining: record independent named OS and hardware evidence.

## P1 — Accounts and recovery

| ID | Scenario | Expected result |
| --- | --- | --- |
| AUTH-01 | Google sign in via default browser, return to app | Secure pairing, no bearer token in browser URLs or local app JavaScript |
| AUTH-02 | Restart app, disconnect/reconnect internet, expire desktop session | Free still works offline; expired online sessions require renewal |
| AUTH-03 | Remote session revoke and sign-out of connected desktop | Online calls rejected promptly, no deletion of perpetual offline certificate |
| AUTH-04 | Generate recovery kit; use code; try reuse and cross-account redemption | Correct one-time use, denial on replay and account mismatch |
| AUTH-05 | CSRF from unrelated origin, unauthenticated account requests | Rejected without mutation |
| AUTH-06 | Account deletion/export request | Verified ownership, legal retention and purchased offline entitlement preservation; implementation/policy required |
| AUTH-07 | Production signing-key backup/restore simulation | v2 encrypted backup decrypted locally, public key and challenge signature verified; preexisting v1 certificate remains valid |

Automated baseline: `tests/account-auth.test.mjs`, `tests/account-dashboard.test.mjs`, `tests/test_account_client.py`, `tests/test_signing_key_backup.py`. Never store real credentials or recovery codes in test output.

## P1 — Website and search

- [ ] Verify the domain in Google Search Console with the business owner's controlled account.
- [ ] Submit `https://humperdinck.studio/sitemap.xml` and capture the sitemap processing result.
- [ ] Inspect exact canonical URLs for all six product pages, gallery and homepage; capture indexing and coverage reports.
- [ ] Run Chrome Lighthouse mobile **and** desktop on the deployed site, recording Core Web Vitals, CLS, LCP and INP where field data exists (Lighthouse lab substitutes TBT for field INP).
- [ ] Inspect narrow 320/360/390 px layouts, 200% zoom, keyboard-only use, reduced-motion settings, slow mobile network and no-JS experience.
- [ ] Recheck Google indexing after new content is deployed; a passing XML validator does not establish indexing.
- [ ] Expand only accurate product documentation, with supported model, hardware, download and Free/Pro claims verified on actual customer hardware.

Automated baseline: `scripts/check-website-seo.py` and frontend CI. Mobile page-speed and live indexing are **not yet independently verified**.

## P1 — License and customer policies

- [ ] See `docs/THIRD_PARTY_RELEASE_AUDIT.md` for upstream and build-artifact audit.
- [ ] Capture separate acceptance/version logs for software license and platform terms without exposing secrets or scripts.
- [ ] Validate signed speaker permission before any upload; preserve minimum evidence only and map deletion/withdrawal needs.
- [ ] Finalize account deletion, age gating, refund policy, community usage rights and retention schedule with counsel.

## P2 — Community Voice Exchange

- [ ] Create protected voice-submission queue and controlled object storage; default visibility private.
- [ ] Add explicit payload preview (voice package, generated sample, minimal metadata only).
- [ ] Generate unpredictable fresh consent text; verify a live statement, transcript, speaker similarity and possession/rights, with anti-replay limitations.
- [ ] Reject self-reported verification booleans from client requests; only accept trusted persisted service decisions.
- [ ] Add risk classification, quarantine, auditable automated approvals for low-risk submissions, escalation for suspicious cases, owner reports and appeals.
- [ ] Immediately block fresh downloads for reports/withdrawals; do not promise remote recall of offline voice copies.
- [ ] Protect public browsing/free previews versus Pro-only verified voice downloads; enforce at server as well as UI.
- [ ] Conduct adversarial QA, privacy and legal review before enabling public clone submission.

Prelaunch unit-policy guards: `src/voice-exchange-policy.js` and `tests/voice-exchange-policy.test.mjs`. This is not yet an integrated submission service.

## Gates that cannot be completed by repository edits alone

- Real Apple Developer ID notarization and Microsoft trusted signing, paid-order issuance and chargebacks.
- Customer-owned Google Search Console domain verification and index status.
- Production private key backup and rotation using locally controlled secure storage.
- Real physical Windows/macOS/Linux end-to-end device tests and independent legal opinion.
