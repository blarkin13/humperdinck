# Narration Studio — section-level sound layers

Sound Effects are selected **inside each narration section**. A sound is not
automatically global. Use the music-note icon on a section, select a sound
from the regular Sound Effects Library, then choose its position and behavior.

## Placement

- **Mix with narration** (default): start the sound when the narration voice
  for that section begins. Multiple sounds can mix together at once.
- **Before narration**: play a one-shot effect before the voice; narration
  begins after the sound completes.
- **After narration**: play a one-shot effect after the voice; the next section
  begins after it completes.

## Mix options (per effect, per section)

- **Loop sound** repeats the clip without changing the narration duration.
- **Cut off at end of section** stops at the boundary of the section that
  started the sound, including its configured inter-section pause.
- **Continue into next section until finished** permits a single clip to play
  across one or more subsequent sections. A non-looping clip stops when its
  audio is finished. If the effect is also set to loop, it loops **until the
  entire narration ends**.
- **Lower volume during speech** provides sidechain-style ducking for each
  independent sound layer. Fade in/out, and volume are independent for each.
- The full render limits mixed sounds to the total narration duration; they
  do not cause the output to run after all narration is complete.

For example, in section 1, selecting ocean waves, mix, loop, and stop at
section end gives waves under only section 1. Selecting continue instead
keeps waves running through all remaining narration. A thunderclap added to
section 2 can overlap the waves.

The mixer supports several layers, while legacy Before/After playback remains
sequential. Other existing endpoints accepting a single global ambience bed
remain available for backwards compatibility; the Narration Studio UI now
encourages section-owned sounds.

## Preview and rendering

The individual section's Play voice button previews its *voice only*.
To hear the exact mixed soundscape, generate the **complete narration**.

Automated regression tests for the new mixer are in
`tests/test_sound_mix.py`. Run:

```bash
python -m pytest -q tests/test_sound_mix.py
npm run build --prefix frontend
```
