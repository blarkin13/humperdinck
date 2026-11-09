# Free/Pro access — implemented entitlement layer, pre-commercial QA

Status reconciled November 8, 2026. Existing accounts, signed lifetime Pro licenses and 10-slot online device controls are implemented in source; this document is not proof of real-device testing or live purchases. Business Plan section 22 and Development Status are the current work register.

## Current policy

- **Free by default; no account or internet sign-in required for local use.**
- Narration Studio, Video Studio, the sound library, Kokoro, the official bundled Humperdinck reference voices, playback, ordinary audio editing, exports and the model manager remain Free.
- **Pro** will unlock personal Qwen VoiceDesign, uploading and cloning a person's reference recording, saving new custom Qwen voice identities, and using those identities in narration. The existing official publisher-curated gallery is separate from any user-submitted community voice library. No Community Voice Exchange or downloadable user-submitted cloned voices are planned.
- Do **not** gate the Qwen model globally. The seven curated Built-In Humperdinck Voices run through the restricted Free Qwen Base reference path.

## What is implemented in this branch

- `backend/entitlements.py` centralizes feature capabilities; `GET /api/entitlements` reports them for desktop UI.
- Backend routes enforce Pro for creating custom voices, voice uploads, text-prompt design, custom Qwen generation, unapproved cloning references, narration with non-curated references, and gallery downloads.
- Official built-in sample installation records a checksum. Existing pre-checksum installed packs retain access through their installer delivery-history ID and fixed reference transcript. This backward-compatible path is **not** cryptographic provenance.
- Voice Creator explains unavailable Pro functionality; everything else, including all studios, is accessible in Free. Gallery previews remain visible and playable.
- Integration tests cover anonymous Free use, unauthorized direct API calls, curated Qwen narration, prior custom voice storage, and packaged build guardrails.

## Development-only Pro preview

From the **source checkout only**, set both environment variables before launching:

```sh
HUMPERDINCK_ENABLE_DEV_ENTITLEMENTS=1 HUMPERDINCK_DEV_PRO=1 bash start.sh
```

For Windows CMD:

```cmd
set HUMPERDINCK_ENABLE_DEV_ENTITLEMENTS=1
set HUMPERDINCK_DEV_PRO=1
start.cmd
```

The preview is automatically disabled in native desktop packages (`HUMPERDINCK_NATIVE_PACKAGE=1`). The temporary flags **are not proof of purchase**. Do not sell access or claim this foundation is a secure licensing system.

## Before commercial launch

1. COMPLETED IN CODE: signed exportable and restorable Ed25519 perpetual offline licenses; verify tamper rejection and restoration again on each native packaged operating system. Versioned key backup/rotation still needs real disaster recovery tests.
2. Establish trusted, signed curated-voice manifests and signed updates. Existing `names.json`, checksums and delivery-history metadata are all locally editable, and thus cannot enforce commercial restrictions against tampering.
3. COMPLETED IN CODE / DEPLOYED ACCOUNT ROUTES: optional Google sign-in, account dashboard, online ten-device registration and self-service deactivation; run fresh-install, 8/10/11-slot, reuse, race, logout and permanent-offline restoration acceptance tests.
4. TEST-ONLY: Lemon Squeezy sandbox webhook signature checks and isolated transaction ledger exist, but require test credentials. Live paid-order verification, production entitlement issuance, receipts, refund/chargeback handling and product eligibility are NOT complete.
5. Test Free, Pro, and offline shutdown restoration in Windows, macOS and Linux release packages.

The repository DOES implement accounts and license activation, plus a DISABLED-BY-DEFAULT test-only checkout route. It does NOT implement approved production checkout or payment-to-license issuance. Do not describe these separate statuses as equivalent.
