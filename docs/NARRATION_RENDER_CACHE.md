# Existing P1: Shared render job and cache pipeline — preset-audio reuse

**Status:** First implementation slice only; cancellation and full cross-engine resume are still open. Do not mark the P1 parent complete from this change.

## What is cached

- Generated and processed **preset** narration speech (such as a supported Kokoro voice), as mono float32 24 kHz WAV, locally under the configured `HUMPERDINCK_DATA/render-cache/` directory (or the normal local Humperdinck data directory if no environment override exists).
- Cache entries use a content-addressed hash of voice key, spoken text, speaking speed, section gain, sound desk settings, model file sizes/modified timestamps and local engine-code hashes. Changes in those inputs trigger a cache miss and a fresh render.
- The original sound cues, mix, ambience, pauses, section order and output format are **not** cached. They are freshly assembled using the existing sound mixer, so editing or reordering those inputs does not force all unchanged preset voices to regenerate.
- Entries survive backend restarts and can be reused when a previously interrupted export is started again. This is **reuse on retry**, not yet a built-in pause/resume operation.
- Cache files are committed atomically and bounded to **256 MiB** by least-recent use. A damaged/invalid WAV is ignored and rendering continues normally, without relying on its contents.

## Privacy and control

- **No audio, scripts, models, account data or recordings are uploaded**. This cache lives on the user's computer.
- **Personal uploaded recordings, designed/cloned voices and character voices are never cached** by this change: a deleted/withdrawn personal voice should not leave cached speech that could still be replayed.
- The cache can contain a user's *spoken script rendered by a preset voice*. Users can completely clear it by closing Humperdinck and deleting their local `render-cache` folder. The folder is recreated as needed. Clearing does not delete saved projects or purchased Pro licenses.
- Model metadata uses size and last-modified time for efficiency, not a cryptographic hash of full model weights. An in-place model replacement that deliberately preserves both values, or changes limited to an external engine package version, may not automatically invalidate cached speech; clear `render-cache` after such manual engine/model changes. Rendering-code changes that affect the cache should update `CACHE_VERSION` in `backend/narration_cache.py`.

## Acceptance evidence and open work

Automated regression: `tests/test_narration_cache.py`, mandatory Python CI.

- Cached waveform is exactly equal to original processed float32 samples across cache reopen/restart.
- Text, voice, speed, gain, desk or ordinary model-file updates invalidate the key.
- Corrupted, invalid and oversize entries do not break rendering; disk usage is bounded by LRU eviction.
- A full narration job using a synthetic preset engine produces equal WAV outputs on retry without calling the engine twice.
- Custom/cloned voices are deliberately bypassed by the cache.

**Still open under existing P1:** cancellation of jobs through a user-facing control; full engine-neutral section resume and safe invalidation for customer-designed voices; robust longer-work render checkpointing and real-device performance/UX measurements. The current `JobStore` marks a running job interrupted by a backend restart as failed, even if reusable preset sections remain on disk.

This source-only change is **not yet a published desktop release** and is not a substitute for Windows/macOS/Linux installation QA.
