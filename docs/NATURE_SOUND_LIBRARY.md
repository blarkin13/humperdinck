# Sound Effects: use genuine field recordings

## Why the procedural starter pack was retired

The original 30 included "nature" effects were programmatically created from
noise and simple oscillators. The results were repetitive and insufficiently
realistic for a professional narration app. We have **removed the synthesizer**
and stopped distributing or installing these sounds. Keeping poor recordings
in the default library undermines user confidence in the product.

On the next Sound Effects Library load, Humperdinck removes only its own
known 30 starter-file IDs (and their metadata). **Your imported WAV/MP3 files
are preserved**. The one-time cleanup marker prevents repeat removal.

## Finding real nature recordings

The library includes an import button and a link to the Wikimedia Commons
nature sounds category:

https://commons.wikimedia.org/wiki/Category:Sounds_of_nature

The audio at Wikimedia Commons has file-specific licenses. Check each
recording's file page and use only material with appropriate permissions.
For broadly redistributable default packs, prefer verified **CC0/public domain**
or similarly permissive recordings with all attribution and share-alike terms
respected. Do not assume all of Wikimedia Commons is public domain.

Other sources that can be evaluated individually include:

- https://opengameart.org/content/park-ambiences — CC0 nature field recordings
- https://opengameart.org/content/cc0-sounds-library — collection requiring
  validation of the exact original audio entry before reuse
- https://pixabay.com/sound-effects/search/rain/ — browse/download for
  user-created projects, but **not** to repackage as a redistributable sound
  library under the standard Pixabay Content License.

Humperdinck does not automatically scrape these sites or claim to redistribute
their audio. Prior to reinstating a bundled 30-sound nature library, curate and
listen to **30 distinct high-quality field recordings**, document the license,
source URL, author and local file checksums, and run audio-quality checks.

## Existing functionality retained

- Search/filter, playable waveform scrubbing, favorites, and downloading
- Importing external recordings (WAV, MP3, FLAC, etc.)
- Assigning an effect before or after a narration section
- Background ambience looping, volume, fades and speech-aware ducking
- Offline/local sound recommendations from your imported library

## Regression tests

```sh
python -m pytest tests/test_starter_sounds.py tests/test_sound_effects.py
npm run build --prefix frontend
```

Test a clean install (no default synthetic audio) and an upgraded installation
(previous synthetic entries removed while custom uploads remain).
