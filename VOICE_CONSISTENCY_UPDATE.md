# Voice consistency update

## What changed
- Qwen now packs consecutive sentences into segments up to 600 characters, rather than restarting voice design at every sentence. A new Qwen generation may still change the voice at a segment boundary.
- Every saved designed-voice preview can be marked **Use as reference voice** in Voice Library. Approval is stored separately per voice version.
- Audio Studio has a new **Reuse approved designed voice (Chatterbox)** engine. It uses the selected approved preview as a reference for every segment of the narration.
- Existing voice designs, preview recordings, and projects remain in the `data/` directory.

## How to use
1. In Voice Library, select a designed voice and generate a preview with a natural 10–20 second sample (ideally clean speech without background sounds).
2. Listen to the sample, then click **Use as reference voice** beside the preview you prefer.
3. In Audio Studio, select **Reuse approved designed voice (Chatterbox)** and the saved voice, then generate narration.
4. If Chatterbox is not installed, use the existing voice-engine installer. This workflow uses the Chatterbox model and does not download a separate Qwen cloning model.

## Limitations
- Reference cloning improves consistency but does not guarantee an exact match. Performance depends on the quality and length of the approved sample and available compute.
- Qwen's 600-character chunk size may be too large for some MLX model versions. If generation becomes unstable, lower `voice_segments`' `limit` in `backend/qwen_engine.py` to 300–400. Longer chunks can use more memory.
- This patch does not change Python dependency installation or eliminate any existing MLX/Chatterbox environment conflicts.
