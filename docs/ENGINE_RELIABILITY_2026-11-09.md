# November 9, 2026 — Engineering reliability batch

**Scope:** All changes committed directly to `main`, with PR #31 and #77
left untouched. This report records code and CI evidence only; no performance
benchmarks on customer machines or real paid order acceptance.

## Account dashboard and privacy

- `website/account/` now has a mobile-friendly Privacy section for signed-in
  account-data export and explicit access/correction/deletion review requests.
  The form confirms requests; it does **not** automatically erase an account.
- Account export omits session and recovery-code secrets and personal voice
  recordings. Customer downloads remain in the browser, not its storage.
- D1 migration `0005_account_privacy.sql` was applied to the existing
  Cloudflare `humperdinck-accounts` database and schema/index names were
  confirmed via read-only SQL. No customer records were modified or deleted.
- Frontend tests `tests/account-privacy-ui.test.mjs` and
  `tests/account-privacy.test.mjs` cover DOM fields, backend authorization and
  privacy-request semantics.
- **Remaining:** Confirm Worker and static assets are deployed, conduct actual
  account UI testing; document verified deletion processor retention. The
  separate non-destructive review process intentionally preserves perpetual
  Pro entitlements.

## Native model setup

- `backend/native_models.py` verifies existing Kokoro model and voice table
  against pinned upstream SHA-256 instead of accepting file length alone.
- A mismatched file is atomically replaced only after the replacement
  passes hash verification, retaining the existing file if the retry fails.
- Free-disk-space preflight gives a clear, actionable message.
- Downloader streams bounded chunks with a maximum file size and publishes
  percentage progress (or MB progress without Content-Length).
- `tests/test_native_models.py` mocks all source downloads offline and tests
  valid reuse, malformed files, network failures, disk shortage and progress.

## Voice identity and GPU selection

- `backend/qwen_torch_engine.py` now hashes the actual reference WAV when
  generating a reusable speaker prompt. Replacing the audio file at the same
  path invalidates the old prompt, preventing reuse of another speaker's
  previously cached identity.
- Qwen PyTorch chooses CUDA when available, BF16 on supported NVIDIA cards,
  FP16 on older CUDA devices, and float32 CPU fallback otherwise.
- `tests/test_qwen_reference_identity.py` and
  `tests/test_qwen_gpu_selection.py` verify mock behavior.
- **Not claimed:** Faster generation or correct CUDA setup on any actual
  Windows/Linux machine; NVIDIA driver, torch build, VRAM and GPU-specific
  tests remain hardware acceptance items.

## Narration Studio correctness

- A completed background generation job will not autoplay if section text
  or its narrator changed while generation was in progress.
- Whole-narration cache signatures explicitly account for section order,
  voices, spoken text, speed, pauses, sound effects, ambience, desk
  settings and output format, preventing stale reuse.
- `tests/narration_sections.test.mjs` covers edited sections, multiple
  speakers, timings, audio signatures and export cache invalidation.
- **Not claimed:** Model-level voice identity consistency between Qwen
  VoiceDesign and clone modes, especially where model pairs or checkpoint
  precision differ.

## Website and installers

- `website/help/install/` provides Windows, Apple Silicon macOS and
  Ubuntu/Debian x64 setup information, download integrity guidance and
  cautious unsigned-application troubleshooting.
- Help & FAQ links to it; `sitemap.xml` and
  `scripts/check-website-seo.py` validate its presence and metadata.
- OS publisher signing remains **optional**, exactly as before the mistaken
  temporary requirement. Separate Tauri updater signatures remain distinct.
- The previous native Windows, macOS and Linux CI packages passed, but these
  source changes still need a new complete native installer run and
  real-device acceptance for production.

## Still gated, unchanged

Live Lemon Squeezy fulfillment; speaker and recording commercial rights for
all seven included references; full binary dependencies and legal notices;
real Windows/Mac/Linux install and GPU QA; owner-held v2 license private
signer activation; and source-code versus deployed-website comparison.
No live checkout, private-signing activation or public installers were
enabled by this batch.
