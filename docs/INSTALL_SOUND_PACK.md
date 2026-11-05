# Installing the nine real CC0 nature recordings

Humperdinck ships **nine genuine field recordings** in the ordinary Sound Effects
Library. There is no separate CC0 tab and no need to choose files individually.

## Release pack and checksum

The approved original-file ZIP is
`humperdinck-cc0-nature-pack.zip`:

SHA-256:
`37c94fa9f2c27df851899d9ac8ed3c8076e0476ea313de838db590a6304c17a7`

It contains these files (all CC0, with author/source metadata in the manifest):

- Trickling Water — Ksd5 (Wikimedia Commons)
- Campfire Crackling — Defaultv (Freesound)
- Wind Over Holehead Hill — Sandy-Ogilvie (Freesound)
- Atlantic Ocean Waves — INNORECORDS (Freesound)
- Thunderstorm — laribum (Freesound)
- Rain on Leaves — SamsterBirdies (Freesound)
- Southern Summer Evening Crickets — RyanKingArt (Freesound)
- Forest Birds — Magnesus (Freesound)
- River and Creek — kentspublicdomain (Freesound)

Frogs at a Pond was not provided and is not included.

## Publishing a fully bundled desktop installer

The maintainers must publish the approved original ZIP **once**:

1. Open **GitHub → Releases → Draft a new release** for the
   `blarkin13/humperdinck` repository.
2. Choose tag **`nature-sounds-v1`** and target **main** (after this PR
   is merged). Attach the original 70 MB
   `humperdinck-cc0-nature-pack.zip` file. Publish the release.
3. Open **Actions → Package desktop installer with nature sounds → Run
   workflow**. Leave `release_tag` set to `nature-sounds-v1`.
4. The workflow checks the original ZIP SHA-256, checks out the merged code,
   and publishes **`humperdinck-desktop-with-nature-sounds.zip`** to the
   same release, as well as uploading a workflow artifact.
5. Distribute **that combined installer ZIP** to Mac, Windows and Linux
   users. They extract the project folder and use the ordinary
   `install.sh` / `install.cmd` install flow.

The combined ZIP includes
`assets/sound-packs/humperdinck-cc0-nature-pack.zip` inside the installer.
The Python core installer detects this bundled copy and imports the nine
recordings directly from disk. **No second download, login, or manual import
is required**.

If a user installs from a Git checkout rather than the combined release ZIP,
the installer instead fetches the same checksum-pinned pack from the
`nature-sounds-v1` release. Its URL is fixed in
`scripts/install_sound_pack.py`.

## Upgrade and data behavior

- The original recordings are normalized to local WAV files in the default
  `data/sound_effects` directory or `HUMPERDINCK_DATA/sound_effects` when
  explicitly configured.
- The install script uses a one-time marker after all nine are present.
  Repeating the installer does not duplicate sounds or re-add sounds a user
  subsequently deleted.
- If a prior manual pack import is already present, those recordings are
  reused, not reimported.
- If interrupted while importing, the next installer run resumes by
  importing only the missing recordings.
- Real user recordings and other imported sounds remain untouched.
- Source credit, license, and original URL metadata are kept on each sound.

## Before publishing

Test the following:

```sh
python -m pytest tests/test_sound_pack_installer.py tests/test_curated_pack.py
npm run build --prefix frontend
```

Also install on a clean Windows machine, macOS and Linux from the **combined
release ZIP**. Confirm all nine tracks appear immediately in Sound Effects
with real waveforms, correct categories, and audio playback.

**Publishing the release asset is required:** source code alone cannot
contain an approximately 70 MB audio pack that has not been committed or
uploaded to a release. Do not announce the bundled installer as available
until that release and its combined ZIP exist.
