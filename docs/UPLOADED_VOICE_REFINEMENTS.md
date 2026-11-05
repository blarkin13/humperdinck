# Refining uploaded voices

Uploaded or microphone-recorded voices are used as reference recordings for the
local cloning engine. Refinements adjust **synthesized output**, never the original
reference WAV. This keeps the original available to restore at any time.

## Workflow

1. Open **Voice Library**, choose an uploaded or recorded voice, then enter **Voice Creator**.
2. Under **Refine this uploaded voice**, adjust Pitch, Pace, Texture/Presence
   and Warmth. Values of 50 are neutral.
3. Optionally write voice-direction notes such as "deeper, slower and warmer".
   **Suggest settings** translates a small set of descriptive words into
   conservative slider starting points. It does not retrain a voice or send the
   prompt directly to the cloning model.
4. Enter a short test script and click Play to generate a **draft preview**.
   You can compare it with the original audio directly above.
5. Click Save to use the current adjustments in subsequent narration
   and library-generated comparison previews. Saved adjustments are versioned;
   expanding **Saved adjustments** allows older values to be restored.

## How the sound changes

- Pitch: up to approximately ±2.5 semitones using a local FFmpeg pitch shift.
- Pace: approximately 80%–120% of neutral delivery speed, separately from pitch.
- Warmth: a gentle low-frequency EQ shelf (up to ±4 dB).
- Texture / Presence (the earlier "rasp" slider): a gentle presence EQ
  (up to ±3 dB). This does **not** authentically create a gravelly or raspy
  vocal performance; stronger changes would need a compatible expressive model.

Because the existing cloning engine takes reference audio rather than arbitrary
textual style instructions, arbitrary prompt-based voice transformations are not
supported. The description is saved as editable guidance and can suggest slider
values. Prompts should not be presented as if they alter vocal identity.

## Compatibility and safety

- The same uploaded voice ID is used in Narration Studio and in saved projects.
- Original audio and existing names/categories remain unchanged.
- Saved settings are stored with existing voice metadata in
  `DATA/voices/names.json`; older uploads without settings are neutral.
- A previous saved version can be restored without editing the reference audio.
- The voice-comparison preview cache includes current refinement settings,
  preventing stale audio when settings change.
- FFmpeg and the installed voice-cloning model are required for synthesized previews.
- Existing reference-audio playback intentionally plays the untouched recording.

## Testing

```sh
python -m pytest tests/test_voice_refinement.py
npm run build --prefix frontend
```

Check with both a real uploaded clip and an edited clip. Generate previews
with extreme and neutral sliders, save and restore versions, and verify
that full narration and sample generation apply the saved refinements.
