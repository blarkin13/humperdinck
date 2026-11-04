# CPU narration presets: Kokoro and Piper

Kokoro ONNX and Piper are **fixed-voice TTS engines**, not arbitrary MP3
voice-cloners. They are deliberately separate from Qwen/Chatterbox cloning.

## Installation

1. Open **Models → Fast preset narration**.
2. Install the Kokoro or Piper engine.
3. Click **Download** next to a voice. Kokoro downloads a shared ONNX model
   and voicepack once; subsequent Kokoro preset voices use the same bundle.
   Piper downloads a separate ONNX model and JSON configuration for each voice.
4. Open **Narration Studio**. Installed presets appear alongside uploaded and
   approved voices; choose one in a narration block.

The model files are stored under `data/models/{kokoro,piper}`, excluded from
source-code updates. A downloaded model works offline. Presets use CPU on
Windows/macOS/Linux and run in isolated Python environments.

British presets include Kokoro **George**, **Fable**, **Emma**, **Isabella** and
Piper **Alan**, **Cori**. English accent selection uses the matching phonemizer
language for Kokoro. There is no voice-cloning claim and no artificial accent
slider in the preset path.

## Why user-created voices are separate

Designed voices and uploaded audio still use the previously selected cloning
engine. A Kokoro or Piper voice sounds like its known preset, but cannot
necessarily reproduce a voice uploaded as MP3. Narration and Video Studio
share the resulting narration waveform.

## Licensing before selling/distributing Humperdinck

- Kokoro ONNX Python wrapper: MIT; Kokoro model: Apache-2.0. Confirm notices
  and model assets before redistributing.
- Current Piper `piper-tts` implementation is **GPL-3.0**. It is installed as
  an optional dependency and invoked via a separate worker, but this does **not**
  establish that bundling it with a closed-source commercial application is
  compatible with its license. Obtain a qualified legal review before sale or
  bundling; it can be omitted if necessary.
- Piper voice models have **individual licensing terms**. Read each voice's
  MODEL_CARD and any training-data limitations before redistributing the model.
- MP3 recordings you obtain from the internet do **not** automatically grant
  the right to clone or redistribute speakers' voices.

## Performance and verification

No real-hardware speed or sound-quality benchmarks are included with this
change. Measure time to first audio, total output length and CPU RAM usage on
an 8 GB Mac and a basic Windows CPU. Compare British accent pronunciation
and voice identity against a short and long script before shipping.
