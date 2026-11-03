# Voice Studio — unified workspace update

## Navigation
- **Voice Library:** upload audio, design with male/female presentation and sliders, or describe a voice in a prompt. Preview candidates without saving; approve a candidate to make it available for narration. Existing versions and samples remain accessible.
- **Narration Studio:** paste narration into one or multiple blocks; select a saved approved voice per block; generate a combined WAV/MP3; play and download the result.
- **Video Studio:** upload a video; use the latest generated narration; set a start offset in seconds; optionally mix the video's existing soundtrack; render and download MP4.

## Requirements
- Existing Python backend dependencies and a working **Chatterbox** installation for narration (including designed voice references).
- Qwen MLX for text-designed voice previews (existing Apple Silicon support).
- FFmpeg for uploads, MP3, and video render. FFprobe for detecting an existing video soundtrack.
- `npm install` in `frontend` if frontend dependencies aren't installed, followed by the normal start command.

## Notes and current limitations
- Voice gender and slider settings are prompt instructions; not guaranteed independent acoustic controls.
- An approved Qwen preview is used as Chatterbox reference audio for longer narration. Identity similarity depends on the model and reference quality.
- Multi-voice narration is assembled sequentially with short pauses. Video currently positions one combined narration track at a start offset; there is not yet a drag-and-drop multi-track timeline or automatic synchronization.
- Existing data is preserved by keeping your current `data/` folder during upgrade. Back it up before replacing application files.
- Preview jobs and narration jobs are held in server memory and don't persist across backend restarts. Download generated clips before restarting.
- The frontend build could not be run in the build environment because npm registry access was unavailable. Python syntax and API smoke tests passed; audio engines and video rendering were not executed against real models/media here.
