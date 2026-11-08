# Free/Pro entitlement foundation (pre-commerce)

Business plan source: "Humperdinck — Business Plan and Product Decisions", revised November 5, 2026, sections 3, 4 and 21.

## Current policy

- **Free by default; no account or internet sign-in required for local use.**
- Narration Studio, Video Studio, the sound library, Kokoro, the official bundled Humperdinck reference voices, playback, ordinary audio editing, exports and the model manager remain Free.
- **Pro** will unlock personal Qwen VoiceDesign, uploading and cloning a person's reference recording, saving new custom Qwen voice identities, and using those identities in narration. Optional gallery voice downloads are Pro pending Voice Exchange planning.
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

1. Integrate cryptographically signed, exportable and restorable perpetual offline licenses. Verify them locally with a pinned public key, not a user-editable flag.
2. Establish trusted, signed curated-voice manifests and signed updates. Existing `names.json`, checksums and delivery-history metadata are all locally editable, and thus cannot enforce commercial restrictions against tampering.
3. Add optional authenticated purchase/device management (ten active installations; unlimited transfers), no login required for Free.
4. Implement payment-provider webhook verification, refund handling, recovery and entitlement issuance.
5. Test Free, Pro, and offline shutdown restoration in Windows, macOS and Linux release packages.

This branch deliberately **does not** implement accounts, payment, license activation or checkout.
