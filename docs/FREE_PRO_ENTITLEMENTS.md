# Humperdinck Free and Pro — entitlement contract

**Updated November 14, 2026.** This is the new product entitlement policy. The account/computer binding is under implementation by Claude Code; the older portable-license implementation may still be present until merged and deployed.

## Free

- Local Free functions remain usable without an account or internet connection, subject to installed model availability.
- Free includes ordinary Narration Studio and Video Studio use, available preset/built-in voices, local playback, supported exports, model management and ordinary audio editing.
- Exactly **four** publisher-curated built-in Humperdinck voices are planned at launch: Sarah, Jason, Kenny and Jerry. The user-submitted Community Voice Exchange and downloadable cloned-voice library are not part of the roadmap.

## Pro

- Pro is a **$49 USD one-time lifetime purchase** attached to a Humperdinck account, with **up to ten activated computers**.
- Pro includes personal voice design, authorized upload/voice cloning, saving custom voice identities and using them in narration (subject to signed speaker consent).
- **Activation requires signing into the purchasing account on each computer.** The computer is represented by a salted hash of the macOS hardware UUID, Windows `MachineGuid`, or Linux `/etc/machine-id`; no raw ID is transmitted.
- Once activated, that computer continues to use Pro **fully offline with no periodic checks**. Another account or another computer cannot use a copied license to unlock Pro.
- New computers and operating-system reinstalls require another sign-in. The ten-device cap is enforced during activation; free unused slots in the Account page. If the online service closes, already-activated computers remain Pro offline but no new activation is possible.
- Already-issued portable certificates continue working and migrate to bound certificates at the next sign-in on the computer; owner/counsel must confirm the notice and grandfathering commitments.

## Security and feature gating

- `backend/entitlements.py` is the desktop feature gate and must enforce the **cryptographic account/computer binding**, not simply account metadata or UI state.
- Native packages must not honor development-only Pro preview toggles. Test anonymous Free, Pro, forged/tampered/mismatched signed licenses, ten-slot race conditions, offline persistence, and reinstall/new computer behavior on macOS, Windows and Linux.
- Keep the signed voice-consent requirements for recognizable real-person voices. No automatic cloud upload of locally created voice files or scripts.
- Device hashes are account-linked identifiers. Retain only for documented activation administration and subject them to privacy export, deletion, security and backup reviews.

## Implementation boundaries

**Claude Code owns** `src/pro-license.js`, desktop license validation, migrations and activation/device registration integration. Old source/fixtures that call certificates `portable-offline-backup`, promise arbitrary restoration after the service shuts down or permit cross-device certificate imports must be replaced or explicitly grandfathered. See [PRO_LIFETIME_LICENSING.md](PRO_LIFETIME_LICENSING.md).

**Do not treat a documentation update as licensing-code acceptance.** The live Stripe checkout/payment-to-entitlement path and account deletion/payment review are separate. Complete implementation, regression and backward-compatibility validation before describing bound activation as deployed.
