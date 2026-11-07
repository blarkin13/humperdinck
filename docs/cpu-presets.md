# CPU narration presets: Kokoro

Kokoro ONNX is a **fixed-voice TTS engine**, not an arbitrary MP3 voice
cloner. It is deliberately separate from Qwen cloning. (Piper was removed in
0.1.5.)

## Installation

1. Open **Models → Fast preset narration**.
2. Install the Kokoro engine, then download the Kokoro voices. One shared ONNX
   model and voicepack unlocks every Kokoro voice.
3. Open **Narration Studio**. Installed presets appear alongside uploaded and
   approved voices; choose one in a narration block.

A downloaded model works offline. Kokoro runs on the CPU on Windows, macOS and
Linux, fast enough for real-time narration.

British presets include Kokoro **George**, **Fable**, **Emma** and
**Isabella**. Each voice uses the matching phonemizer language. There is no
voice-cloning claim in the preset path.

## Why user-created voices are separate

Designed voices and uploaded audio use the selected Qwen cloning model. A
Kokoro voice sounds like its known preset, but cannot reproduce a voice
uploaded as MP3. Narration and Video Studio share the resulting narration
waveform.

## Licensing before selling/distributing Humperdinck

- Kokoro ONNX Python wrapper: MIT; Kokoro model: Apache-2.0. Confirm notices
  and model assets before redistributing.
- MP3 recordings you obtain from the internet do **not** automatically grant
  the right to clone or redistribute speakers' voices.
