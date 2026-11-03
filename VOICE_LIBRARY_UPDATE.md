# Voice Library update

Adds designed-voice recipes, version history, voice duplication, rename, deletion, preview persistence, and selection in Audio Studio. Cloned-voice uploads remain available.

## Install / update

1. Back up your current `voice-studio-starter` folder, especially `data/`.
2. Copy the contents of this package into your existing `voice-studio-starter` folder, replacing application source files. **Do not delete your existing `data/` directory.**
3. Start Voice Studio as before. No new Python packages are required beyond the existing installation. The SQLite database is created automatically at `data/voice_library.sqlite3`.
4. Open **Voice Library**, create a designed voice, save it, and generate a preview. Select that voice in **Audio Studio** to use its active version.

## Notes

- Existing uploaded voices are unchanged.
- A saved recipe is not an identity-locked voice. Qwen may produce a different speaker on each generation.
- The preview is saved as a WAV after successful Qwen generation. The UI offers version restoration, not editing previous versions in place.
- Designed voice samples are stored under `data/designed_voice_samples/`.
- The Qwen engine itself is unchanged. This update does not resolve model-specific MLX compatibility or memory issues.
- Frontend dependencies are installed through the existing installer; if necessary, run `npm install` inside `frontend`.
- Voice generation has not been run in this build environment; SQLite and API CRUD tests passed. Frontend build could not be completed because npm dependency installation timed out.
