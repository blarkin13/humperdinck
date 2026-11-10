# November 10, 2026 — Nine bundled sound-source license observations

**Source-page verification performed; not yet release artifact clearance.** Audited the exact nine source URLs cited in `docs/REDISTRIBUTION_EVIDENCE_2026-11-08.md`. The live public pages of all eight Freesound recordings explicitly display **Creative Commons 0**, and the Wikimedia page states **CC0 1.0 Universal**. These are source-specific observations and may be used as provenance leads; they are **not** proof that the packaged normalized WAVs match the reviewed originals, that content was uploaded by the actual rights holder, or that a date-stamped original HTML/PDF archive has been retained. Download access is not needed to verify that the source page lists CC0, but hash matching requires the original download.

| Bundled ID | Author | Exact source | Observed source license (2026-11-10) | Original file hash and local snapshot | Processed WAV hash |
| --- | --- | --- | --- | --- | --- |
| rain-leaves | SamsterBirdies | https://freesound.org/people/SamsterBirdies/sounds/584272/ | CC0 explicitly displayed | PENDING | PENDING |
| thunderstorm | laribum | https://freesound.org/people/laribum/sounds/353025/ | CC0 explicitly displayed | PENDING | PENDING |
| atlantic-ocean | INNORECORDS | https://freesound.org/people/INNORECORDS/sounds/457740/ | CC0 explicitly displayed | PENDING | PENDING |
| river-creek | kentspublicdomain | https://freesound.org/people/kentspublicdomain/sounds/325182/ | CC0 explicitly displayed | PENDING | PENDING |
| forest-birds | Magnesus | https://freesound.org/people/Magnesus/sounds/723913/ | CC0 explicitly displayed | PENDING | PENDING |
| hilltop-wind | Sandy-Ogilvie | https://freesound.org/people/Sandy-Ogilvie/sounds/847257/ | CC0 explicitly displayed | PENDING | PENDING |
| night-crickets | RyanKingArt | https://freesound.org/people/RyanKingArt/sounds/746366/ | CC0 explicitly displayed | PENDING | PENDING |
| campfire | Defaultv | https://freesound.org/people/Defaultv/sounds/536935/ | CC0 explicitly displayed | PENDING | PENDING |
| trickling-water | Ksd5 | https://commons.wikimedia.org/wiki/File:Swale.ogg | CC0 1.0 Universal explicitly displayed | PENDING | PENDING |

Official license references:
- Freesound license guide: https://freesound.org/help/faq/
- CC0 deed: https://creativecommons.org/publicdomain/zero/1.0/

**Archive requirement:** On the trusted release machine, save each exact source page with visible creator, source URL, CC0 license and capture date (PDF/HTML), compute `shasum -a 256` for the page capture and original source-audio bytes, compute SHA for the normalized WAV, and cross-reference the nine entries in the exact final sound-pack manifest. Do not equate an author profile or Freesound platform license overview with a license for an unrelated file. Do not set `sound_sources_archived_and_verified=true` until archives and hashes match the actual distributed recordings.

**Qwen source family observation:** The official `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` Hugging Face card reports Apache-2.0 at https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign . The owner's seven voices were reported as own-voice + Qwen, but the actual model/revision/transform source was not provided; do **not** assign that exact model ID as their provenance without evidence.

**Status:** Nine of nine source pages currently observed advertising CC0. Zero of nine original audio bytes and processed WAVs were independently hash-matched here; original page archives and final bundle cross-check still pending. This is a meaningful reduction in *license classification uncertainty*, not release clearance.
