# Development roadmap

## Implemented in starter
- React interface with three sections
- FastAPI health endpoint
- Local voice sample upload with 30MB limit
- Local video upload
- JSON project persistence for timed sentences
- Cross-platform core install and startup scripts

## Not yet implemented
- Chatterbox/F5-TTS adapter, GPU detection, model download and voice synthesis
- Sentence generation queue, waveform preview, audio export
- Frame-accurate timeline, playback and timing controls
- FFmpeg mixing and final video export
- yt-dlp integration for permitted downloads; URL validation and SSRF protections
- PDF extraction, project browsing, security hardening and packaging
- Automated tests and CI across Windows/macOS/Linux

## Suggested order
1. Voice engine adapter + real audio export
2. Timed-sentence job queue + WAV assembly
3. Video timeline + FFmpeg mix/export
4. Authorized YouTube import
5. Robust installers, smoke tests and packaged releases

Only clone voices with permission. Review model licenses before redistribution or commercial use. YouTube downloads must comply with applicable rights and platform terms.
