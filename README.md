<p align="center"><img src="docs/assets/humperdinck-logo.png" alt="Humperdinck" width="360"></p>

# Humperdinck

Cross-platform local web application for cloning a **consenting speaker's** voice and turning text into downloadable WAV or MP3 audio. Voiceover timeline and YouTube import are future milestones.

## Requirements

- Python **3.11 or 3.12** and Node.js 20+ with npm.
- FFmpeg available on `PATH` (needed to normalize voice recordings and encode MP3).
- Internet connection for initial installation and model weight download.
- A compatible NVIDIA GPU is recommended. CPU generation is possible but may be very slow. Apple Silicon MPS is attempted when available; model compatibility varies and is not guaranteed.
- Model installation requires substantial disk space and memory; exact requirements depend on PyTorch and platform.

## Install

Windows: double-click these in the Humperdinck folder, in order:

1. `install.cmd`
2. `install-voice.cmd`
3. `start.cmd` (use this to open Humperdinck from now on)

These are plain batch files; no PowerShell is used. If SmartScreen shows "Windows protected your PC", click **More info → Run anyway**. The installer finds Python 3.11 or 3.12 and, if they are missing, installs Python 3.11, Node.js and FFmpeg with winget (your other Python versions are untouched).

macOS/Linux:

```bash
bash install.sh
bash install-voice.sh
bash start.sh
```

The core installer creates `.venv` and installs the frontend. The **separate voice installer** installs the Qwen3-TTS cloning engine, PyTorch, and audio dependencies. On systems with incompatible PyTorch wheels, the optional installer may fail: use the correct platform-specific PyTorch installation first, then retry. CUDA acceleration requires a compatible PyTorch build and drivers. Model weights are downloaded through the Models tab before generating.

Open http://127.0.0.1:5173. Upload a clean voice recording under Voice Library, select it in Audio Studio, paste text, click Generate, then preview/download WAV or MP3. Each long text is segmented and concatenated with short pauses.

## Platforms and models

Humperdinck runs on macOS, Windows and Linux. Open the **Models** tab to pick the model for each job, install engines and download models.

| Engine | Jobs | Platforms | Notes |
|---|---|---|---|
| Qwen3-TTS (MLX) | Voice design | macOS on Apple Silicon | Fastest on M-series Macs. 4/6/8-bit and bf16 models |
| Qwen3-TTS (PyTorch) | Voice design, cloning | macOS, Windows, Linux | Uses an NVIDIA GPU (CUDA) when one is present, otherwise the CPU |
| Kokoro ONNX | Fast preset narration | macOS, Windows, Linux | Preset voices for lightweight CPU narration |
| Piper | Fast preset narration | macOS, Windows, Linux | Individual CPU voices; license review before redistribution |

Install from the command line:

```
python scripts/install_engine.py qwen-torch --model Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign
```

Installs and downloads need the internet once. After that everything runs offline (set `HUMPERDINCK_ONLINE=1` to allow downloads at run time). Choices are saved in `data/settings.json`.

## Current limits

- Jobs run in a single background thread per request, serialized through one model lock; **jobs are not persisted** across restarts. Completed audio files remain under `data/outputs`.
- The app is bound to localhost and is **not hardened for exposure to the internet**. Do not port-forward it.
- No voice authentication or deletion UI yet. Delete voice WAV files in `data/voices` manually.
- Generated speech can contain pronunciation errors and may vary between segments.
- This release does not implement video timing, YouTube download, or video export.
- Tested on macOS (Apple Silicon). Windows and Linux are supported but have not yet been tested on real machines.
- Check the licensing of every model and preset voice before redistribution or commercial use, especially Piper's GPL-3.0 implementation.

See `docs/REQUIREMENTS.md` and `docs/ROADMAP.md` for further plans.

### macOS Python environment (Apple Silicon and Intel)

`bash install.sh` now detects Python 3.11/3.12 and creates an isolated `.venv`.
If neither version exists, it uses `uv` to install Python 3.11 without replacing
macOS system Python. When Homebrew is available, the script can install `uv`;
otherwise install `uv` from https://docs.astral.sh/uv/getting-started/installation/
and rerun. Node.js/npm must also be installed. FFmpeg is needed for MP3 output.

```bash
bash install.sh
bash install-voice.sh
bash start.sh
```

To check the isolated environment: `.venv/bin/python --version`.
The second step installs ML dependencies, which may require platform-specific
adjustments on Apple Silicon. Installation has not been verified on macOS 27.
If a prior `.venv` uses the wrong Python version, rename it to `.venv-old`
and rerun `bash install.sh`.

## Experimental synthetic voice design on Apple Silicon (M1/M2/M3/M4)

The Voice Designer uses MLX-Audio and Qwen3-TTS VoiceDesign. No voice sample is required.

```bash
bash install.sh
bash start.sh
```

In Audio Studio, choose **Design a synthetic voice (Qwen MLX)**, describe the voice, enter a short sentence, and select Generate. Preview and download WAV or MP3. First use downloads model weights; MP3 requires FFmpeg. This is **experimental and not hardware-tested**. The configured model is an 8-bit MLX community variant; verify the repository exists and supports `instruct` before relying on it. If unavailable, select a compatible VoiceDesign checkpoint in `backend/qwen_engine.py`. An 8 GB Mac may be unable to load a 1.7B model with sufficient headroom. Start with a short sentence and close other applications. Long-form consistency is not yet guaranteed. Qwen3-TTS Base is available for reference-audio cloning.

### Apple Silicon automatic voice engine setup

The main `bash install.sh` installs and verifies `mlx-audio` automatically on Apple Silicon. The separate `install-qwen-mac.sh` is retained only for repair/reinstallation. Qwen model weights are fetched at first generation, and actual model inference is not verified by installation. An 8 GB Mac may encounter memory pressure.

## Engine isolation, jobs and tests

- Each speech engine runs in its own short-lived worker process (`backend/worker.py`), using
  `.venv-qwen` or `.venv-qwen-torch` when present and falling back to `.venv`. Model memory is
  returned to the OS when the worker stops. Override an interpreter with `HUMPERDINCK_QWEN_PYTHON` /
  `HUMPERDINCK_QWEN_TORCH_PYTHON`.
- The worker stays running between jobs so the model loads once. Only one engine is kept in
  memory at a time. Settings (environment variables, in seconds):
  `HUMPERDINCK_IDLE_TIMEOUT_S` (default 300) stops an idle worker to free memory;
  `HUMPERDINCK_STALL_TIMEOUT_S` (default 600) fails a job that stops reporting progress;
  `HUMPERDINCK_LOAD_TIMEOUT_S` (default 1800) allows for first-time model downloads.
  `POST /api/engine/unload` frees the model immediately; `/api/health` shows `resident_engine`.
- Job status is stored in `data/jobs.sqlite3`, so finished narrations can still be used in
  Video Studio after a restart. Jobs that were running during a restart are marked failed.
- Run the smoke tests (fake engine, temporary data folder):

```bash
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python -m pytest -q tests
```

## Updates

Each time you run `bash start.sh` (or `start.cmd` on Windows), Humperdinck checks the latest commit on
`main` at `blarkin13/humperdinck`:

1. It compares GitHub's git file hashes with the files on your computer.
2. If anything differs, it lists the changed files and asks whether to install.
3. If you approve, it downloads the snapshot at that exact commit, verifies every file's
   hash, backs up the files it will replace to `.update/backups/`, installs, reinstalls
   dependencies if `requirements.txt` or `package.json` changed, and relaunches.

The **Check updates** button in the app does the same, then restarts and reloads the page.
Only code is managed: `data/`, the `.venv*` environments and `node_modules` are never touched.
Offline, the check is skipped and the installed version starts. Private repositories use your
`gh` login (or `HUMPERDINCK_GITHUB_TOKEN`). Skip the startup check with
`HUMPERDINCK_SKIP_STARTUP_UPDATE=1`.
