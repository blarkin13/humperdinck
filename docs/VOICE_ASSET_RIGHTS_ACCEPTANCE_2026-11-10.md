# P0 — Voice and asset commercial-rights acceptance

> **CURRENT LAUNCH SCOPE — November 12, 2026:** There are exactly **four** Built-In Humperdinck Voices: **Sarah, Jason, Kenny and Jerry**. No additions until **well after the full launch**. Earlier four-voice inventory/rights statements below are superseded by [the four-voice launch record](BUILTIN_LAUNCH_FOUR_2026-11-12.md). Commercial approval remains BLOCKED pending exact artifact, source/license and installer acceptance; no self-signed owner release is needed.


**Status: BLOCKED for independent third-party redistribution checks, not for a self-signed declaration.** Updated November 10, 2026 after the owner's provenance clarification.

## Recorded first-party voice provenance

Brian confirmed that all **four Built-In Humperdinck Voices** were made by blending **recordings of his own voice** with Qwen. No four separate performers were identified. **Do not require Brian to sign a grant to himself.** Do not invent speaker releases, source-ownership certificates or per-voice consent agreements. This is an owner-reported source statement, not an independent verification of the audio.

The reference pack is `humperdinck-builtin-voices-launch-four-v1.zip` with SHA-256 `59086a4e9b53eec23f7d33b3acd6a10d1e5a1328ee80eaf93b59218f29038d38`. Its exact four sample hashes can be extracted with `scripts/inspect-owner-voice-pack-rights.py` on the operator's machine, without uploading recordings. The original owner declaration draft is OPTIONAL and should not be treated as a launch acceptance gate.

A practical source note for the release ledger is:

> Owner-confirmed (Brian, Nov 10, 2026): four built-in voice samples were generated from recordings of his own voice using Qwen. Any additional third-party reference recordings, copyrighted scripts or model/source restrictions must still be disclosed and respected.

The Qwen model/revision actually used for the four outputs is not independently confirmed by this statement. `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` publishes Apache-2.0 terms, but do not automatically assume that exact model was used for every clip. Record the real available model identities and review relevant licenses.

## Exact-release acceptance checklist

| Category | Evidence already recorded | Remaining release verification |
| --- | --- | --- |
| **Four owner-derived voices** | Owner's first-person source statement; pinned ZIP digest; local four-sample inspector available | Match all four original sample SHA-256 hashes to exact packaged ZIP; confirm no unlicensed third-party voice/source recording, check Qwen model variants/NOTICE and exact release artifact |
| **Nine nature sounds** | Eight Freesound item pages and one Wikimedia Commons file page separately observed displaying CC0 Nov 10; see `docs/NATURE_SOUND_LICENSE_SOURCE_CHECK_2026-11-10.md` | Archive the nine item-specific license pages and compare original-file and normalized WAV hashes to the actual installed assets |
| **Qwen and MLX conversions** | Public model families declare Apache-2.0; model weights user-downloaded, not in default installer | Review exact model/variant and applicable license/NOTICE; do not assume all Qwen or third-party reference recordings inherit the same rights |
| **Kokoro ONNX and runtime** | User-downloaded model and voices SHA-pinned; runtime bundled; upstream model terms Apache-2.0 and runtime MIT identified | Match downloaded model/voice table to source and license notices; audit bundled runtime and actual wheel/native dependencies |
| **Optional Piper voices** | Voice weights not shipped in native default build | Review the exact voice-specific license *only for included or distributed voices*; do not infer rights from Piper runtime MIT license |
| **DiceBear avatars** | `@dicebear/core` and `@dicebear/lorelei` 9.4.2; MIT code and CC0 design notices in `website/THIRD_PARTY_NOTICES.txt` | Confirm final installer/studio actually includes the required notice text |
| **FFmpeg and frozen platform dependencies** | Native CI does not explicitly stage FFmpeg; dependency inventories exist | Inspect exact Windows/macOS/Linux built artifacts, transitive licenses and notices; if an FFmpeg executable is present, inspect build flags, LGPL/GPL obligations and corresponding source |
| **Release scope** | Rights gate in `scripts/check-release-rights.py` fails closed | Require reviewed exact commit/version, matching shipped hashes and sound/dependency evidence; keep `docs/RELEASE_RIGHTS_APPROVAL.json` at BLOCKED until actually verified |

## Practical owner-only provenance route (no signature)

1. Preserve Brian's November 10 statement in the internal history as source provenance; no additional paper grant by Brian to Brian is needed for this project.
2. Run the existing **local** voice pack inspector on the exact pinned ZIP. Keep the hash-only result. The inspector cannot establish the speaker's identity, but it verifies the four reference bytes used in the release.
3. Identify the actual Qwen model(s), engine and versions **where creation records make them available**, and review applicable license/NOTICE terms. If it turns out third-party reference voices or copyrighted performances were blended in, audit those separately.
4. Finish the item-specific CC0 page archives and original/normalized sound hashes; review actual frozen installer content and notices.
5. For a final public release, record the operator's reviewed commit/version and verified four sample hashes in a private `humperdinck-release-rights-v2` ledger. This **does not** require a signed performer declaration or copyright grant when all inputs are owned by the same owner. Do not mark the independent sound/dependency checks true without reviewing them.
6. Re-run the gate for the exact shipped release. Any changed voice zip, new performer or outside reference material requires a fresh source review.

## Release gate behavior

`scripts/check-release-rights.py` accepts **v2 first-party provenance** only when the operator has verified exactly four distinct sample digests against the packaged ZIP, acknowledged the owner's source ownership and absence of unlicensed third-party source audio, reviewed relevant Qwen model terms, and accepted original sound source and frozen dependency notices. It still verifies exact build/version, named reviewer/date and FFmpeg evidence where applicable.

The legacy v1 path continues to require signed external performer and recording-rights evidence for a release using different people's recordings; do not repurpose it to fabricate documents for owner-generated clips. **Neither record shape nor automated CI proves legal clearance.**

## What is and is not preventing closure

- **No longer a blocker:** an owner signature/declaration granting himself commercial permission for his own voice.
- **Still open:** the exact four sample ZIP/hash mapping; exact Qwen model/license notice evidence; nine actual sound/source archives and WAV hashes; native dependency/source/NOTICE acceptance; final release version review.
- **Not an approved substitute:** a green CI run, a generic CC0 claim for a site, or a broad Apache-2.0 label applied without identifying the used components.

References: `docs/REDISTRIBUTION_EVIDENCE_2026-11-08.md`, `docs/THIRD_PARTY_RELEASE_AUDIT.md`, `docs/NATURE_SOUND_LICENSE_SOURCE_CHECK_2026-11-10.md`, `docs/RELEASE_RIGHTS_APPROVAL.json`, `scripts/prepare_native_voice_pack.py`, and `scripts/check-release-rights.py`.
