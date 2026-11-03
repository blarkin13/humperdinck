# Voice Studio (local prototype)

Cross-platform local web application for cloning a **consenting speaker's** voice and turning text into downloadable WAV or MP3 audio. Voiceover timeline and YouTube import are future milestones.

## Requirements

- Python **3.11 or 3.12** and Node.js 20+ with npm.
- FFmpeg available on `PATH` (needed to normalize voice recordings and encode MP3).
- Internet connection for initial installation and model weight download.
- A compatible NVIDIA GPU is recommended. CPU generation is possible but may be very slow. Apple Silicon MPS is attempted when available; model compatibility varies and is not guaranteed.
- Model installation requires substantial disk space and memory; exact requirements depend on PyTorch and platform.

## Install

Windows PowerShell:

```powershell
./install.ps1
./install-voice.ps1
./start.ps1
```

macOS/Linux:

```bash
bash install.sh
bash install-voice.sh
bash start.sh
```

The core installer creates `.venv` and installs the frontend. The **separate voice installer** installs Chatterbox, PyTorch, and audio dependencies. On systems with incompatible PyTorch wheels, the optional installer may fail: use the correct platform-specific PyTorch installation first, then retry. CUDA acceleration requires a compatible PyTorch build and drivers. Model weights are downloaded on first generation.

Open http://127.0.0.1:5173. Upload a clean voice recording under Voice Library, select it in Audio Studio, paste text, click Generate, then preview/download WAV or MP3. Each long text is segmented and concatenated with short pauses.

## Current limits

- Jobs run in a single background thread per request, serialized through one model lock; **jobs are not persisted** across restarts. Completed audio files remain under `data/outputs`.
- The app is bound to localhost and is **not hardened for exposure to the internet**. Do not port-forward it.
- No voice authentication or deletion UI yet. Delete voice WAV files in `data/voices` manually.
- Generated speech can contain pronunciation errors and may vary between segments.
- This release does not implement video timing, YouTube download, or video export.
- Dependencies have not been installed or tested on Windows, macOS, or Linux in this build environment. Syntax checks and engine-independent tests were performed.
- Check Chatterbox model and dependency licenses before redistribution or commercial use.

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

In Audio Studio, choose **Design a synthetic voice (Qwen MLX)**, describe the voice, enter a short sentence, and select Generate. Preview and download WAV or MP3. First use downloads model weights; MP3 requires FFmpeg. This is **experimental and not hardware-tested**. The configured model is an 8-bit MLX community variant; verify the repository exists and supports `instruct` before relying on it. If unavailable, select a compatible VoiceDesign checkpoint in `backend/qwen_engine.py`. An 8 GB Mac may be unable to load a 1.7B model with sufficient headroom. Start with a short sentence and close other applications. Long-form consistency is not yet guaranteed. Chatterbox remains available for reference-audio cloning.

### Apple Silicon automatic voice engine setup

The main `bash install.sh` installs and verifies `mlx-audio` automatically on Apple Silicon. The separate `install-qwen-mac.sh` is retained only for repair/reinstallation. Qwen model weights are fetched at first generation, and actual model inference is not verified by installation. An 8 GB Mac may encounter memory pressure.

## Engine isolation, jobs and tests

- Each speech engine runs in its own short-lived worker process (`backend/worker.py`), using
  `.venv-qwen` or `.venv-chatterbox` when present and falling back to `.venv`. Model memory is
  returned to the OS after every job. Override an interpreter with `VOICE_STUDIO_QWEN_PYTHON` /
  `VOICE_STUDIO_CHATTERBOX_PYTHON`.
- Job status is stored in `data/jobs.sqlite3`, so finished narrations can still be used in
  Video Studio after a restart. Jobs that were running during a restart are marked failed.
- Run the smoke tests (fake engine, temporary data folder):

```bash
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python -m pytest -q tests
```
