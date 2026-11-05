# Sound Effects and Narration Soundscapes

Humperdinck's sound library uses **locally imported audio**. Do not redistribute sound
files unless you have appropriate permission. No ElevenLabs media is bundled.

## What this release does

- Import effects in supported audio formats, normalize to mono 24 kHz WAV, and
  store them under the application's local data directory.
- Attach up to eight effects per narration section, before or after the voice.
- Set effect volume and optional fade-in/fade-out (0–10 seconds).
- Add one continuous background ambience loop for a full narration.
- Adjust ambience volume, automatic ducking during narration, and background
  fade-in/fade-out. The engine creates an audio mask from the generated speech
  clips and gradually lowers the ambience beneath those clips.
- Suggest matching effects using your **existing library only**. The wand uses
  an installed, running **local Ollama** model when possible and falls back to
  fast offline word matching. It **never** imports or inserts sounds automatically.
- Export the completed soundscape with the existing MP3 or WAV narration workflow.

## Suggestion setup

No additional setup is required for the offline keyword suggestions. For local
AI-assisted suggestions, run Ollama on the same computer with a compatible
language model already installed (the server is expected at
`http://127.0.0.1:11434`). Humperdinck asks for at most three existing sound
IDs. It validates all model-selected IDs against the library. If Ollama is not
available or times out, the request returns the offline fallback instead.
No models are downloaded automatically, and no remote AI service is contacted.

## Editor workflow

1. Import your own sound effects in the **Sound Effects** tab.
2. In **Narration Studio**, use the music icon on any section to add cues.
   Choose before/after, volume, and fades; expand attached cue chips to edit.
3. Use the **Suggest sounds** wand in the picker to review candidate effects.
4. Under the sections, select **Background ambience** and adjust the volume,
   speech ducking and fade controls.
5. Generate the **full narration** to hear the combined soundscape; the
   resulting MP3/WAV includes the effects. Section-only previews remain voice
   previews rather than full multitrack mixes.

## Scope and limitations

- The soundscape mixer is **desktop-only**. The public hosted Studio still
  synthesizes browser voice previews and does not upload a sound library.
- Effects are positioned before or after sections, not yet at arbitrary
  word-level timestamps.
- Background ambience loops by repeating its source file; choose a seamless
  loop asset to prevent audible boundary artifacts.
- Mixing is offline, not a real-time DAW timeline. Speech ducking uses the
  duration of each generated voice clip, not silence detection within speech.
- This feature **does not generate new sound assets** from text. AI is only used
  to recommend sounds already installed locally.

## Test

```sh
python -m pytest tests/test_sound_mix.py tests/test_sound_suggest.py tests/test_sound_effects.py
node --test tests/sound_suggestions.test.mjs
npm run build --prefix frontend
```

Manually validate that changing a cue, fade, or ambience setting invalidates
the previously generated full-narration audio, and that both export formats
include the resulting mix.
