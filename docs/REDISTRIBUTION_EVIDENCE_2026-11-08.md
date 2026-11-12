# Humperdinck — model, audio, runtime redistribution evidence

> **CURRENT LAUNCH SCOPE — November 12, 2026:** There are exactly **four** Built-In Humperdinck Voices: **Sarah, Jason, Kenny and Jerry**. No additions until **well after the full launch**. Earlier seven-voice inventory/rights statements below are superseded by [the four-voice launch record](BUILTIN_LAUNCH_FOUR_2026-11-12.md). Commercial approval remains BLOCKED pending exact artifact, source/license and installer acceptance; no self-signed owner release is needed.

_Last checked: November 8, 2026. This is a technical provenance review, NOT legal approval._

## Actual native release payload and legal conclusions

The default three-OS unsigned preview builds in `.github/workflows/native-desktop.yml`
run `scripts/prepare_native_voice_pack.py`, `scripts/prepare_native_sound_pack.py`,
and `scripts/build_native_sidecar.py` **without** `--ffmpeg-dir`.

| Item | Source / exact identity | Upstream rights | Included in default installer? | Clearance |
| --- | --- | --- | --- | --- |
| Qwen3-TTS VoiceDesign / Base weights | `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` and user-selectable Base variants, downloaded by optional engine installers | Publisher declares Apache-2.0 (https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign) | **No model weights**. User downloads separately | **Model-family terms favorable**; exact revision, tokenizer and download-time notice evidence still required |
| MLX-community quantized Qwen3-TTS | `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit` and multiple separately listed converted variants | Individual MLX model cards declare Apache-2.0 (https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit) | No weights; optional user downloads | Verify each offered revision and its own card/NOTICE; not a blanket license for recordings |
| Kokoro ONNX model | `thewh1teagle/kokoro-onnx` GitHub `model-files-v1.1`; pinned `kokoro-v1.0.onnx` SHA-256 `beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a` and `voices-v1.0.bin` SHA-256 `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d` | Kokoro ONNX weights published under Apache-2.0: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX | **Downloaded by user**, not packaged in default native installer | Verified project source and strong model-family license evidence; exact mirrored binary notices and voice-table attribution still need to be archived |
| `kokoro-onnx` Python runtime | https://github.com/thewh1teagle/kokoro-onnx | Upstream runtime MIT; Kokoro model Apache-2.0 | **Yes** via PyInstaller dependency | Include corresponding MIT text and inspect wheel/native dependencies |
| Piper runtime / voices | Optional runtime catalog, no pinned voice model shipped by this native workflow | Piper runtime repo MIT (https://github.com/rhasspy/piper); separately trained voice models may use **different** licenses | No Piper voice weights by default | **DO NOT claim all Piper voices are commercially redistributable.** Resolve each selected voice dataset/license separately |
| FFmpeg / ffprobe | Optional `--ffmpeg-dir` is **not used** by current native CI; `imageio-ffmpeg` is used only to generate WAVs at build time | LGPL-2.1+ by default; GPL or nonfree configurations change obligations: https://ffmpeg.org/legal.html | **No explicit runtime FFmpeg binary** in current default installer build; inspect frozen packages for accidental inclusion | No separate runtime FFmpeg redistribution clearance assumed. Any future bundle needs exact build flags, SHA, matching source, linked libraries and notices |
| Four built-in reference voices (Nov 12 launch override) | `humperdinck-builtin-voices-launch-four-v1.zip`; GitHub release asset SHA-256 `59086a4e9b53eec23f7d33b3acd6a10d1e5a1328ee80eaf93b59218f29038d38`; 615,819 bytes (local candidate; publication pending) | **Owner confirms four samples derive from his own voice recordings blended with Qwen (Nov 10); no third-party performer identified** | **Yes: four reference clips** | **PENDING:** match exact four sample SHA-256 values, record Qwen model terms and verify no other unlicensed audio. No self-signed performer releases required |
| Nine nature sound originals / processed native WAVs | `humperdinck-cc0-nature-pack.zip` SHA-256 `37c94fa9f2c27df851899d9ac8ed3c8076e0476ea313de838db590a6304c17a7`; 72,548,903 bytes; normalized WAV pack generated in CI | Source pages currently declare CC0; CC0 permits commercial reuse: https://creativecommons.org/publicdomain/zero/1.0/ | **Yes: nine normalized sounds** | Source links reviewed; archive date-stamped source-specific license pages, creator evidence, original/proc hashes before public sale |
| Python/Node/Rust dependencies | Build-specific PyInstaller/Tauri and frontend dependency trees | Mixed open-source licenses | **Yes** | Need per-platform SBOM and corresponding LICENSE/NOTICE verification; locked dependencies should be captured from release jobs |

### Sound source-specific primary evidence (nine packaged items)

Freesound pages and Wikimedia Commons source page from `backend/curated_sounds.py`:
- `rain-leaves` https://freesound.org/people/SamsterBirdies/sounds/584272/
- `thunderstorm` https://freesound.org/people/laribum/sounds/353025/
- `atlantic-ocean` https://freesound.org/people/INNORECORDS/sounds/457740/
- `river-creek` https://freesound.org/people/kentspublicdomain/sounds/325182/
- `forest-birds` https://freesound.org/people/Magnesus/sounds/723913/
- `hilltop-wind` https://freesound.org/people/Sandy-Ogilvie/sounds/847257/
- `night-crickets` https://freesound.org/people/RyanKingArt/sounds/746366/
- `campfire` https://freesound.org/people/Defaultv/sounds/536935/
- `trickling-water` https://commons.wikimedia.org/wiki/File:Swale.ogg

**Do not mistake one author's general description for the actual item's license.**
Preserve the exact page's stated license, screenshot/PDF, timestamp, author, asset
checksum and licensed original, plus the normalized WAV checksum. CC0 does not
license a recognizable person’s voice or eliminate publicity rights.

## Before public release (release-acceptance gates)

1. **Owner-derived voice provenance:** Brian confirmed on November 10 that all four reference clips were derived from recordings of his own voice blended with Qwen. No signature granting oneself permission is required. Run the local pack inspector to verify all four SHA-256 sample hashes match the pinned ZIP; record any Qwen model details available and confirm whether third-party audio sources were used. Audit permission only for any outside voices actually used. The first-party provenance record is not a license for third-party recordings.

2. **Runtime license manifests:** Collect exact `pip freeze`, Python wheel
   metadata licenses, npm lockfile, Cargo lockfile and the actual frozen
   executable contents. Respect MIT/Apache/CC-BY/LGPL and codec dependencies.
3. **FFmpeg:** The CI default includes no explicitly staged runtime ffmpeg.
   If a vetted FFmpeg binary is added later, provide FFmpeg `-version`,
   `-buildconf`, SHA, LGPL text, corresponding source/link, license
   compatibility and functional tests for each OS. Merely omitting an
   `--enable-gpl` flag is not a full combined-program legal review.
4. **Model download notices:** Pin/review exact Qwen and Kokoro revisions and
   show license/attribution for optional user-downloaded model weights. Do not
   silently package weights or voices under a blanket Humperdinck license.
5. **Approval:** A named person dates the exact release build/commit, inventory
   hash, legal review and evidence pack. An engineering test pass does NOT
   constitute clearance or verify a document signature.

**Status:** Owner-reported first-party voice provenance recorded; no self-signed voice authorization is required. Sound license pages identified. **Commercial release remains blocked by incomplete exact sound/source archives, Qwen revision notices and frozen binary dependency review.**
No Community Voice Exchange is planned.
