# Humperdinck third-party commercial distribution audit

Status: **IN PROGRESS — NOT A LEGAL CLEARANCE OR RELEASE APPROVAL** (November 8, 2026).
Source catalog: `backend/catalog.py`, `backend/native_models.py`, `scripts/build_native_sidecar.py`, `website/THIRD_PARTY_NOTICES.txt`.

## Preliminary upstream findings

| Component | Evidence found | Distribution status and next proof |
| --- | --- | --- |
| Qwen3-TTS VoiceDesign 1.7B (PyTorch) | Hugging Face model card declares Apache-2.0: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign | Check all exact Base variants, package code, tokenizer assets and any extra third-party notice obligations; pin revisions and preserve license/NOTICE. This is *not* clearance of user-uploaded reference voices. |
| MLX-community Qwen3-TTS VoiceDesign 8-bit | Model card declares Apache-2.0 and derived Qwen model: https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit | Verify exact 4/6/8-bit and BF16 revisions plus MLX-audio code/dependency terms separately, including source modifications. |
| Kokoro 82M v1.0 ONNX | onnx-community model card declares Apache-2.0: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX | Verify the exact native GitHub mirror and model-file SHA-256 used in `backend/native_models.py`, voices, upstream attribution and the browser ONNX distribution. |
| Piper runtime | The archived rhasspy/piper source declares MIT: https://github.com/rhasspy/piper/blob/master/LICENSE.md | This is NOT a blanket license for the separately trained downloadable voices. Development moved to another implementation; check the exact installed runtime version and voice-specific model cards before including weights. |
| FFmpeg / FFprobe | Official LGPL licensing with GPL/nonfree options: https://ffmpeg.org/legal.html | Existing `checked_ffmpeg_files` validates metadata, supplied COPYING.LGPLv2.1 and rejects GPL/nonfree build configuration. No vetted platform binaries or source correspondence has been verified here. Preserve exact source, configure flags, applicable notices, distribution obligations and codec restrictions. |
| Built-In Humperdinck Voices (seven described in business plan) | Curated reference voice pack is application data; no provenance or speaker permission proof in this audit | Confirm each reference recording's signed authorization, commercial distribution rights, copyright/license, exact transcript and package hash. Do not bundle unverified audio. |
| Nature/sound effects packs | Individual asset provenance and author permission may differ from app code license | Reconcile every packaged sound against `docs/CC0_NATURE_COLLECTION.md`, file hashes, exact source URLs and archive evidence; do not treat a website label alone as conclusive. |
| Python / Node / Tauri / ONNX / media libraries | Multiple transitively redistributed components | Generate locked per-platform SBOMs; record version, exact license, license text, source correspondence and notices; audit native shared libraries, not just top-level dependencies. |

## Release artifact acceptance gate

For **each Windows .exe, macOS .dmg, Linux .deb and downloadable voice/model pack**, a reviewer must capture:
1. Artifact SHA-256, build commit, build date, architecture and actual included file tree.
2. Every bundled model, voice, sound, binary and transitive library with its exact version/revision and origin.
3. SPDX expression (or unresolved), link to legal text, attribution, NOTICE and required corresponding source or offer.
4. For FFmpeg, `ffmpeg -version`, `ffmpeg -buildconf`, codec list, license file and source archive location matching the binary.
5. Written evidence of creator/speaker permissions for all distributed reference voices.
6. A verified cross-OS render of WAV/MP3/video outputs using the *exact* shipped binary and runtime.
7. Documented reviewer/date and any unresolved blockers; mark **NOT APPROVED** until all red items are resolved.

## Consent and legal policy checks

- Public policies requiring prior express signed speaker permission are published, but their enforceability is not certified. Record meaningful acceptance of final software license and voice policy versions at the correct flows; distinguish checkboxes from speaker's actual signed authorization.
- A live randomly generated microphone statement, ASR transcription and similarity screening are *evidence*, not a legal identity guarantee. Limit retention and access, support withdrawal/reporting and jurisdictional rights.
- Provide counsel the actual data flow, screenshots, personal cloning workflow, logs/retention schedule, refund terms, age gate, account deletion and offline perpetual entitlement.
- Keep local personal voice files under the user's control; no community downloadable cloned-voice exchange is planned.
- Red-team the consent-verification flow against prerecorded speech, voice conversion, TTS replay, mismatched speaker, unauthorized guardian/third party and withdrawal after distribution.

**Decision:** No final commercial redistribution/voice-cloning approval is recorded by this checklist. Obtain the actual third-party terms, complete the artifact inventory and undertake the required legal review before monetized public release.
