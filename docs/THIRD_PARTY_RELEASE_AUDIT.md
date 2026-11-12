# Humperdinck third-party commercial distribution audit

> **CURRENT LAUNCH SCOPE — November 12, 2026:** There are exactly **four** Built-In Humperdinck Voices: **Sarah, Jason, Kenny and Jerry**. No additions until **well after the full launch**. Earlier seven-voice inventory/rights statements below are superseded by [the four-voice launch record](BUILTIN_LAUNCH_FOUR_2026-11-12.md). Commercial approval remains BLOCKED pending exact artifact, source/license and installer acceptance; no self-signed owner release is needed.


Status: **IN PROGRESS — NOT A LEGAL CLEARANCE OR RELEASE APPROVAL** (November 8, 2026).
Source catalog: `backend/catalog.py`, `backend/native_models.py`, `scripts/build_native_sidecar.py`, `website/THIRD_PARTY_NOTICES.txt`.

## Updated review and enforced distribution gate

Detailed source-by-source model, sound and bundled-asset evidence:
[`REDISTRIBUTION_EVIDENCE_2026-11-08.md`](REDISTRIBUTION_EVIDENCE_2026-11-08.md).
The current unsigned native builder packages **four SHA-pinned Humperdinck
reference voices** and nine SHA-pinned CC0 nature sounds, but does **not**
bundle Qwen checkpoint weights or explicitly bundle FFmpeg as a runtime tool.
Kokoro ONNX runtime code is included; its model weights are downloaded by
the user. Piper voice weights are not bundled in the default native workflow.

Original Qwen3-TTS and Kokoro models identify their licenses as Apache-2.0;
the archived Piper runtime is MIT but newer Piper implementations and voice
dataset licenses must be checked separately, as not all Piper voices have
unrestricted commercial rights. Freesound's exact nine source pages and the
Wikimedia Commons CC0 description were reviewed. The source references and
asset archive hashes are in the detailed evidence report.

**Public publishing is now blocked by default** using
`scripts/check-release-rights.py` and a privately controlled
`RELEASE_RIGHTS_APPROVAL_JSON` GitHub Actions secret. An exact-commit approval must record the four SHA-matched owner-derived voice samples and Brian's source-provenance statement (no self-signed release required), plus archived sound source evidence and final platform dependency/notice review. If third-party voices are later added, permission records are required for those voices. The tracked
`docs/RELEASE_RIGHTS_APPROVAL.json` intentionally remains `BLOCKED`;
its purpose is a public description of what is not approved, not permission
to ship. If third-party rights documents are ever required, the operator retains them privately; the owner's own recorded voice needs only a provenance note, not a fictional release form.

The native preview CI now attaches a per-platform installer SHA256 inventory,
`pip freeze`, frontend npm lock and generated Cargo lock when present.
Those files aid human license review; an automated passing test is **not**
legal approval.

## Preliminary upstream findings

| Component | Evidence found | Distribution status and next proof |
| --- | --- | --- |
| Qwen3-TTS VoiceDesign 1.7B (PyTorch) | Hugging Face model card declares Apache-2.0: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign | Check all exact Base variants, package code, tokenizer assets and any extra third-party notice obligations; pin revisions and preserve license/NOTICE. This is *not* clearance of user-uploaded reference voices. |
| MLX-community Qwen3-TTS VoiceDesign 8-bit | Model card declares Apache-2.0 and derived Qwen model: https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit | Verify exact 4/6/8-bit and BF16 revisions plus MLX-audio code/dependency terms separately, including source modifications. |
| Kokoro 82M v1.0 ONNX | onnx-community model card declares Apache-2.0: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX | Verify the exact native GitHub mirror and model-file SHA-256 used in `backend/native_models.py`, voices, upstream attribution and the browser ONNX distribution. |
| Piper runtime | The archived rhasspy/piper source declares MIT: https://github.com/rhasspy/piper/blob/master/LICENSE.md | This is NOT a blanket license for the separately trained downloadable voices. Development moved to another implementation; check the exact installed runtime version and voice-specific model cards before including weights. |
| FFmpeg / FFprobe | Official LGPL licensing with GPL/nonfree options: https://ffmpeg.org/legal.html | Existing `checked_ffmpeg_files` validates metadata, supplied COPYING.LGPLv2.1 and rejects GPL/nonfree build configuration. No vetted platform binaries or source correspondence has been verified here. Preserve exact source, configure flags, applicable notices, distribution obligations and codec restrictions. |
| Built-In Humperdinck Voices (four approved for launch) | Curated reference voice pack is application data; no provenance or speaker permission proof in this audit | Owner confirmed on Nov 10 that all seven were created from his own recordings using Qwen. Record that provenance, match the seven exact sample hashes and check for any third-party input and applicable Qwen terms. No self-signed performer release is needed. Do not bundle unverified third-party audio. |
| Nature/sound effects packs | Individual asset provenance and author permission may differ from app code license | Reconcile every packaged sound against `docs/CC0_NATURE_COLLECTION.md`, file hashes, exact source URLs and archive evidence; do not treat a website label alone as conclusive. |
| DiceBear voice-card avatars (SHIPPED since 0.1.28: `@dicebear/core` 9.4.2, `@dicebear/lorelei` 9.4.2, pinned in `frontend/package.json`) | DiceBear code: MIT, Copyright (c) 2024 Florian Körner (from the installed package LICENSE). Lorelei design by Lisa Wischofsky: CC0 1.0. License page: https://www.dicebear.com/licenses/ | Full MIT text and the CC0 design notice are in `website/THIRD_PARTY_NOTICES.txt`. Avatars are generated locally in the client; no DiceBear API or network dependency. Re-check the package LICENSE files and update this row whenever the versions change. |
| Python / Node / Tauri / ONNX / media libraries | Multiple transitively redistributed components | Generate locked per-platform SBOMs; record version, exact license, license text, source correspondence and notices; audit native shared libraries, not just top-level dependencies. |

## Release artifact acceptance gate

For **each Windows .exe, macOS .dmg, Linux .deb and downloadable voice/model pack**, a reviewer must capture:
1. Artifact SHA-256, build commit, build date, architecture and actual included file tree.
2. Every bundled model, voice, sound, binary and transitive library with its exact version/revision and origin.
3. SPDX expression (or unresolved), link to legal text, attribution, NOTICE and required corresponding source or offer.
4. For FFmpeg, `ffmpeg -version`, `ffmpeg -buildconf`, codec list, license file and source archive location matching the binary.
5. Seven sample hashes matched to owner-confirmed first-party Qwen provenance; actual signed permissions only for any third-party references, if present.
6. A verified cross-OS render of WAV/MP3/video outputs using the *exact* shipped binary and runtime.
7. Documented reviewer/date and any unresolved blockers; mark **NOT APPROVED** until all red items are resolved.

## Consent and legal policy checks

- Public policies requiring prior express signed speaker permission are published, but their enforceability is not certified. Record meaningful acceptance of final software license and voice policy versions at the correct flows; distinguish checkboxes from speaker's actual signed authorization.
- A live randomly generated microphone statement, ASR transcription and similarity screening are *evidence*, not a legal identity guarantee. Limit retention and access, support withdrawal/reporting and jurisdictional rights.
- Provide counsel the actual data flow, screenshots, personal cloning workflow, logs/retention schedule, refund terms, age gate, account deletion and offline perpetual entitlement.
- Keep local personal voice files under the user's control; no community downloadable cloned-voice exchange is planned.
- Red-team the consent-verification flow against prerecorded speech, voice conversion, TTS replay, mismatched speaker, unauthorized guardian/third party and withdrawal after distribution.

**Decision:** No final third-party asset/installer distribution approval is recorded by this checklist. The owner's voice does not itself require a self-signed permission form. Obtain the actual third-party terms, complete the artifact inventory and undertake the required legal review before monetized public release.
