# Humperdinck customer hardware requirements — publication evidence

Updated 2026-11-10. Public draft: `website/help/requirements/index.html`.

## Evidence and claim boundaries

| Category | Customer-facing claim | Status | Acceptance needed |
| --- | --- | --- | --- |
| Windows | x64 installer, Windows 10/11 target | Installer target documented; version floor not validated | Fresh installation and first narration on minimum intended Windows build |
| macOS | Apple Silicon arm64 DMG, MLX acceleration for compatible models | Architecture verified as current build target; memory thresholds not proven | M-series 8/16/24+ GB repeatable model-by-model memory and success tests |
| Linux | Debian/Ubuntu x64 .deb | Architecture/build target documented | Exact distribution/version and dependencies on clean x64 installation |
| Small speech engines | Kokoro/Piper can operate without dedicated GPU | Supported architecture; actual minimum CPU not measured | Cold/warm generation timings and peak resident memory |
| Qwen MLX | Apple Silicon unified memory constraints | Owner benchmark of M2 8 GB for a Qwen 1.7B preview exists; not a universal support minimum | Record peak memory, success/failure and latency by model and Mac RAM |
| Qwen CUDA | NVIDIA accelerator depends on GPU/driver/PyTorch compatibility | Code path automated tests; physical CUDA profiling open | Exact NVIDIA GPU, VRAM, driver, engine, model and generated WAV |
| Model downloads | Model files separate from desktop install, can be multi-gigabyte | Model setup architecture documented | Record final model byte sizes, peak temporary disk and installed footprint by engine |
| Offline | Generation works with installed models and local files | Previously owner tested on preview installer | Confirm model-specific offline behavior in published current release |
| Export | Generated audio downloaded to user Downloads folder | Preview owner-tested | Validate normal, denied and low-disk cases for current release |

**Do not turn unmeasured RAM, VRAM, disk or OS numbers into guarantees.** Product marketing must not label a configuration "minimum supported" until its clean-install + relevant-model and failure-path tests pass. A successful smoke on one build is not broad compatibility proof.

## Recommended measurement fields

Record for each platform and engine: exact app version and commit, OS build, CPU architecture, CPU model, GPU name and VRAM / Mac unified memory, available disk before/after downloads, model and engine revision, cold load seconds, warmed text-to-audio seconds for a fixed paragraph, peak process RAM, peak GPU/MLX memory, first export WAV/MP3 success, offline retest, and user-observed failure or warning.

Target platform combinations initially:
- Windows x64 without NVIDIA: Kokoro/Piper CPU and an explicitly designated Qwen fallback, plus one supported CUDA configuration
- Apple Silicon M-series with 8 GB and 16 GB (and higher where available) on supported MLX model variants
- Ubuntu/Debian x64 with CPU and supported CUDA configurations

Publish numeric minimum/recommended system requirements only after owner verifies these combinations. Where a model is unsupported on a class, state that explicitly rather than inflating the universal app minimum.

## Publishing and support readiness

- Public page has unique SEO metadata, one h1, canonical, JSON-LD and sitemap entry, all enforced by `scripts/check-website-seo.py`.
- Both `/help/` and `/help/install/` link to the requirements guide; in-app model UI links can be added after verifying the app's external-link allowlist and Tauri behavior.
- No claim of signed Windows/macOS installers is made. Windows Smart App Control and macOS Gatekeeper may block unsigned builds; do not recommend turning off protections.
- Troubleshooting requests ask for environment and exact errors without requesting passwords, keys, license exports, recordings or scripts.
- Acceptance requires a verified deployed live page and practical cross-platform/mobile testing; successful CI/merge alone does not establish public availability.

**Tracker interpretation:** The publication-source and SEO checks are self-contained engineering subtasks. The broad public hardware requirements acceptance remains OPEN until numeric operating-system, CPU/GPU, RAM/VRAM and disk figures are backed by real hardware tests.
