# Development roadmap

## Where we are (November 2026)

Working end to end on an 8 GB M2 Mac:

- Voice Library: upload, slider design and prompt design, preview candidates, approve,
  versions with restore. Narration keeps using the newest approved version when a draft edit
  is saved.
- Narration Studio: sequential multi-voice blocks, WAV/MP3 export.
- Video Studio: one narration track placed at a start time, optional original-audio mix, MP4.
- Engines run in per-job worker processes from their own environments (`.venv-qwen`,
  `.venv-chatterbox`); memory is released after each job.
- Jobs persist in `data/jobs.sqlite3`; smoke tests in `tests/`.

## Ideas borrowed from other local voice apps

We studied the public docs of debpalash/VoiceStudio (AGPL-3.0) for product ideas only.
**No code from that project is to be copied into this one.** Each item below is our own
design, sized for this codebase and for low-memory Macs.

### 1. Reliability (next)

- **Keep a warm engine with an idle timeout.** Today every job starts a new worker and reloads
  the model (Chatterbox took minutes on first run). Keep one worker alive between jobs and stop
  it after N idle minutes (default 5; lower on 8 GB). Only one engine resident at a time:
  starting Qwen stops an idle Chatterbox worker first.
- **Generation time budget.** Kill a worker that reports no progress for a set time and mark the
  job failed with a clear message, instead of hanging.
- **Cache reference encodings.** Store whatever the engine derives from an approved reference
  (keyed by sample id + engine version) so reused voices start faster.
- **Seeded designs.** Record a random seed with each Qwen preview so a candidate can be
  regenerated identically, and store it on the approved version.

### 2. Better narration

- **Inline tags in the script:** `[pause 500ms]` everywhere first (we insert silence ourselves,
  so it works on every engine). Engine-specific tags (`[laughter]`) later, and grey them out in
  the editor when the selected engine would read them aloud.
- **Per-block cache and partial regenerate.** Hash each block by text + voice + settings; when
  the user edits one block, render only that block and reassemble. Also lets an interrupted
  long narration resume.
- **Delivery direction per block** ("whispered", "urgent") passed to engines that support it.
- **Check audio** button: scan a finished take for clipping, long silences, empty output and big
  volume jumps, with clickable timestamps. Advisory only; never modifies the file.
- **Optional loudness leveling** on export (FFmpeg `loudnorm`), off by default.
- **Realtime factor and time-left** on long jobs, measured from the first few segments.

### 3. Video timeline

- Store narration as **segments with start/end times** instead of one track, so each block can
  be placed and nudged on the timeline.
- **Fit-to-slot:** if a clip runs longer than its slot, warn and offer: shorten the text, or
  time-stretch with pitch preserved (FFmpeg `atempo`) within a safe range. Never silently cut
  words.
- **Subtitles:** export SRT/VTT from the block text and timings; optional burn-in.
- Later, for dubbing existing footage: separate voice from background music, transcribe,
  detect speakers, then a "cast" view mapping each detected speaker to a saved voice.

### 4. Models and hardware

- **Model manager page:** list engines, installed/not installed, disk size, licence, and
  download/remove buttons. Ask before any download and show real progress.
- **Hardware-aware defaults:** detect RAM and accelerator at startup and pick conservative
  settings (one job at a time, short idle timeout, smaller models) on 8 GB machines.
- **Warn before slow jobs:** estimate time from text length and the measured realtime factor,
  and say so before generating.
- Evaluate lighter CPU-friendly engines and keep each in its own environment, using the same
  worker protocol.

### 5. Integrations (later)

- Local automation API documentation, batch queue, watch folder.
- Transcription (for subtitles and dubbing).
- Authorized YouTube import (still a placeholder).

## Housekeeping

- Rename the app before sharing it: "VoiceStudio" is already a widely used open-source project.
- Review each model's licence before redistribution or commercial use. Only clone voices with
  permission.
