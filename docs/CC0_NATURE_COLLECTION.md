# Import nature recordings into the existing Sound Effects Library

There is **no separate CC0 section, tab, or collection** in Humperdinck.

The user-supplied original CC0 recordings are packaged as a ZIP containing
`humperdinck-sounds.json` and their audio originals. To import them:

1. Open **Sound Effects** in the desktop application.
2. Click the existing **Import sounds** button.
3. Select **humperdinck-cc0-nature-pack.zip**.
4. The importer validates file checksums, source identifiers, supported file
   types, and maximum file sizes, then adds all nine to the normal library.

The existing category/search/favorites/waveform controls work immediately.
The user can place imported sounds before/after narration or use them as
background ambience.

The pack contains nine recordings the user provided:
- Trickling Water — Ksd5, Wikimedia Commons
- Campfire Crackling — Defaultv, Freesound
- Wind Over Holehead Hill — Sandy-Ogilvie, Freesound
- Atlantic Ocean Waves — INNORECORDS, Freesound
- Thunderstorm — laribum, Freesound
- Rain on Leaves — SamsterBirdies, Freesound
- Summer Evening Crickets — RyanKingArt, Freesound
- Forest Birds — Magnesus, Freesound
- River and Creek — kentspublicdomain, Freesound

The tenth selected recording, Frogs at a Pond — Hrothmeir, was not among
the files supplied and is **not included**. The pack is separately delivered
as a download in the project conversation rather than embedded in Git history
because it contains approximately 70 MB of original audio.

The importer stores the original author, catalog source URL, provider and
CC0 license with each sound. Only the ten pinned source IDs in
`backend/curated_sounds.py` can appear in a curated pack.
Duplicates already imported under those IDs are skipped.

A ZIP has a manifest version of 1 and a `sounds` list with
`slug`, `file`, and `sha256` for each recording. Each entry must match its
own bytes. ZIP entries are read by filename only; the archive is never
extracted to disk. Neither the standard file importer nor the installer
automatically downloads from Freesound.

## Test

```sh
python -m pytest tests/test_curated_pack.py
npm run build --prefix frontend
```

After merging, test pack import using the downloadable ZIP from this chat;
also test repeat import, metadata display, playback and audio export.
