# Release acceptance matrix — Humperdinck (November 8, 2026)

Status labels: CODED / DEPLOYED / CI PASS / HUMAN VERIFIED / BLOCKED / NOT DONE.
CI PASS must never be substituted for HUMAN VERIFIED on named physical hardware.

## P1 — Free and Pro licensing

| ID | Scenario | Expected result | Evidence |
| --- | --- | --- | --- |
| ENT-01 | Fresh offline install, no account | Free Narration, Video, Sounds, Voice Library and supported exports available | OS/version, screen recording, saved audio file |
| ENT-02 | Free user tries personal Qwen VoiceDesign, custom reference clone or saved Qwen identity via UI and direct API | Denied server-side; curated approved built-in references not blocked | HTTP responses + UI |
| ENT-03 | Free user tries unauthorized personal Qwen cloning via direct API | Pro required; no unlicensed reference cloning | HTTP + UI |
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
- [ ] Finalize account deletion, age gating, refund policy, personal voice cloning consent and retention schedule with counsel.

## Removed feature — downloadable cloned-voice community

The Community Voice Exchange and downloadable user-submitted cloned-voice library were cancelled before implementation. Do not build consent-recording upload pipelines, publication queues, user-to-user downloads, moderation or appeal workflows. Personal consent-based cloning and the official Humperdinck publisher-managed gallery are different features and remain in scope.

## Gates that cannot be completed by repository edits alone

- Real Apple Developer ID notarization and Microsoft trusted signing, paid-order issuance and chargebacks.
- Customer-owned Google Search Console domain verification and index status.
- Production private key backup and rotation using locally controlled secure storage.
- Real physical Windows/macOS/Linux end-to-end device tests and independent legal opinion.

## Automated engineering progress — November 8, 2026 (no owner secrets)

- **CI native build:** GitHub Actions run 42562083486 successfully packaged
  Windows x64 EXE, Apple Silicon macOS DMG and Ubuntu x64 DEB, with native
  smoke tests; all three individual license-audit bundles were uploaded.
  These builds remain **unsigned previews**. No physical UI launch, OS vendor
  signing, notarization or genuine v2 production-issued certificate acceptance
  is claimed.
- **Dependency evidence:** `scripts/collect-dependency-rights.py` records
  installed Python distribution metadata and npm lockfile identities for
  release review. A missing license field remains UNKNOWN. CI attaches this
  evidence separately, not as legal approval.
- **Account API security:** `src/limited-json.js` enforces a 4 KiB streaming
  request-body cap even if a request omits `Content-Length`. OAuth/account
  rate limiting now performs an atomic conditional D1 insertion rather than
  a separate COUNT then INSERT. Regression tests cover malformed/oversized
  JSON and parallel device-pairing attempts.
- **Pro:** online activation cryptographically signs the perpetual certificate
  **before** writing an online device registration, avoiding stranded slots
  on signing failure. v1 issuance remains default; owner must personally stage
  v2 before activating it. Existing offline v1 certificates remain valid.
- **Sandbox commerce:** webhook regression tests include duplicate paid events,
  refunded events, out-of-order webhook delivery and confirmation that test
  orders never touch actual Pro-license or device tables. Real payment
  fulfillment remains disabled.
- **Fail-closed release report:** `.github/workflows/launch-readiness.yml`
  produces a machine-readable report listing manual, legal, hardware and
  ownership gates. The initial workflow and Python/frontend validation have
  passed. The report does not self-declare commercial readiness or certify
  signed speaker permission.
- **Open:** commercial rights for seven built-in voice samples, transitive
  frozen binary license audit, actual source-archived CC0 license evidence,
  v2 key staging and rollback drill, installed Windows/Mac/Linux tests,
  OS code-signing/notarization, live merchant approval, real account deletion
  and retention procedures, and independent legal review.

