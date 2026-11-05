# Curated CC0 nature collection

Ten real nature recordings were selected by reviewing the exact public file pages.
Each page identifies the recording as Creative Commons Zero (CC0 1.0).
This collection does **not** create synthetic replacement sounds.

## How to install

Open Humperdinck desktop > Sound Effects > **Real nature recordings · CC0
collection**.

- **Trickling Water (Ksd5 / Wikimedia Commons)**: choose **Install**.
  Humperdinck downloads the authentic file at a fixed, hard-coded URL, checks
  the original file's SHA-1 checksum against the official Commons source
  metadata, normalizes to the local audio format and records its provenance.
  An Internet connection is required only for the initial installation.
- **The other nine sounds (Freesound)**: choose **Source** to open the exact
  recording page, log into Freesound and download the original file. Back in
  Humperdinck, choose **Import file** beside that entry, then select the
  downloaded file. Original-quality Freesound downloads are authenticated,
  and the API requires OAuth2; the app does not bypass login or silently
  replace the original with a preview-quality MP3.
- Once imported, the sounds appear in the normal library as genuine playable
  audio, with search, waveform, preview, favorites, narration cues, ambience
  and downloads.

## Verified source list

| Name | Author | License | Source |
| --- | --- | --- | --- |
| Rain on Leaves | SamsterBirdies | CC0 | https://freesound.org/people/SamsterBirdies/sounds/584272/ |
| Thunderstorm | laribum | CC0 | https://freesound.org/people/laribum/sounds/353025/ |
| Atlantic Ocean Waves | INNORECORDS | CC0 | https://freesound.org/people/INNORECORDS/sounds/457740/ |
| River and Creek | kentspublicdomain | CC0 | https://freesound.org/people/kentspublicdomain/sounds/325182/ |
| Forest Birds — Seamless Loop | Magnesus | CC0 | https://freesound.org/people/Magnesus/sounds/723913/ |
| Wind Over Holehead Hill | Sandy-Ogilvie | CC0 | https://freesound.org/people/Sandy-Ogilvie/sounds/847257/ |
| Southern Summer Evening Crickets | RyanKingArt | CC0 | https://freesound.org/people/RyanKingArt/sounds/746366/ |
| Frogs at a Pond | Hrothmeir | CC0 | https://freesound.org/people/Hrothmeir/sounds/850667/ |
| Campfire Crackling | Defaultv | CC0 | https://freesound.org/people/Defaultv/sounds/536935/ |
| Trickling Water | Ksd5 | CC0 | https://commons.wikimedia.org/wiki/File:Swale.ogg |

The Wikimedia audio uses
`https://upload.wikimedia.org/wikipedia/commons/8/84/Swale.ogg`, SHA-1
`4f97748c715d90fda6357073f14a12e68f294d73`.

## Packaging and licensing

- **No Freesound audio is committed or auto-downloaded.** The source listing
  is a verified catalog, not a preinstalled audio bundle. The user supplies
  those original files after authenticated download.
- The one Commons audio is downloadable on demand, not embedded in Git.
- Imported files retain source page, creator, provider, CC0 marking and
  categorized title in the local catalog. The user's manually selected
  Freesound file is not cryptographically verified against the original.
  Inspect the selected recording before redistribution.
- The uploader supports up to 65 MiB and ten minutes to accommodate the
  wind recording and long pond ambience.
- No automated Freesound API access or credentials are involved.

## Validation

```sh
python -m pytest tests/test_curated_sounds.py tests/test_sound_effects.py
npm run build --prefix frontend
```

Manual tests required: direct Wikimedia install and checksum behavior, each
authenticated Freesound download/import, playback, waveform/seek, narration
effects, background ambience, install status, and Modern/Vintage themes.
