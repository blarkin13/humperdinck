# Built-In Humperdinck Voices

## Privacy-preserving distribution workflow

The owner has six uploaded-and-edited voice profiles. The original uploads are
**never published**. The app creates one approved, edited narration sample for
each voice, reading this exact reference text:

> The old lighthouse stood quietly above the waves, waiting for the next storm.

The resulting approved, generated audio sample is used as the cloning reference
for the voice on the recipient's desktop. A sample is not a trained model.
The recipient must still have the supported cloning engine and model installed.
The new sentence-limited reference may not perfectly preserve the character of
the longer original recording, so **audition the generated voices in a clean
installation** before offering the pack publicly.

### Owner: create the voice pack

1. Update Humperdinck and open **Voice Library**.
2. Expand **Built-In Humperdinck Voices**.
3. For each finished upload-based profile, click **Generate sample**.
4. Listen to the exact lighthouse sentence. If it sounds wrong, adjust the
   original private profile and regenerate until satisfied.
5. Click **Approve** only when the generated sample sounds correct.
6. Check **Include** for each of the six approved voices.
7. Click **Export 6 Built-In Humperdinck Voices**.
8. The app downloads `humperdinck-builtin-voices-v1.zip`. It contains only
   the six generated WAV samples and manifest metadata (name, category,
   source-independent stable identifier, approved sentence, checksum, and
   informational editing settings). It does **not** include the original
   upload, the private filename, or the user's source WAV.

The importer identifies these as **Built-In Humperdinck Voices** in the
normal Voice Library, not a new section or tab. It remembers the exact
reference transcript for cloning, so generated speech from this voice can
work without the original recording.

### Distribute to new installations

1. Create a GitHub Release with tag `builtin-humperdinck-voices-v1`
   and attach the ZIP exported above.
2. The existing `scripts/install.py` automatically invokes
   `scripts/install_voice_pack.py`. From Git checkouts, it retrieves this
   release file when available. Until the release exists, installation
   skips the optional voice pack.
3. To physically embed the pack in the complete desktop installer, run
   **Package desktop installer with nature sounds** again. It checks for the
   published built-in voice release, and includes the ZIP at
   `assets/voice-packs/humperdinck-builtin-voices-v1.zip` along with the
   existing nine nature sounds. The resulting combined installer ZIP is
   uploaded to the nature-sounds release.
4. Users download that full installer, run the normal install command,
   and find the new voices in the same Voice Library. No manual import.


### Adding more built-in voices later

The initial six are **not a fixed limit**. For example, you can release six now,
then add three more a month later:

1. In Voice Library, create/edit additional private source voices as usual.
2. Open **Built-In Humperdinck Voices**, generate the lighthouse sentence,
   listen, and approve each new generated sample.
3. The publisher automatically preselects previously approved voices. Keep
   the original six selected **along with** your three new voices, then export
   the updated `humperdinck-builtin-voices-v1.zip`.
4. Open the same GitHub Release tagged `builtin-humperdinck-voices-v1`.
   Delete its old ZIP asset and upload the new ZIP with **the same filename**.
5. Run **Package desktop installer with nature sounds** again. Its newest
   combined installer ZIP will now include all nine voices alongside the
   nine nature recordings.
6. Anyone installing from the refreshed installer gets the expanded collection.
   Existing users can run `.venv/bin/python scripts/install_voice_pack.py`
   again from an unbundled source checkout (it fetches the current release).
   To refresh an older bundled installer, download the newer combined installer
   or replace the bundled voice pack locally.

The installer maintains a per-voice delivery history: voice IDs remain stable
across releases, so existing voices are not overwritten or duplicated.
If a user deleted one of the original six, publishing an updated pack will
not restore it. New voices are added to the regular Voice Library with category
**Built-In Humperdinck Voices**.

The approved generated sample remains separate from the original uploaded
recording. No source uploads go into either ZIP.

### Notes

- These are **cloning references**, not pre-trained speaker-specific weights.
- A generated lighthouse sample still contains a synthetic representation of
  vocal identity. Distribute only with voice owner's consent and appropriate
  rights; synthetic reference audio is not a privacy guarantee.
- Saved adjustment settings are captured as metadata; the generated reference
  has the approved adjustments already rendered into it. The installer does
  not reapply those adjustments, to avoid double processing.
- Stable exported IDs and per-voice delivery history avoid duplicates, preserve
  user edits and allow later additions. Repeated installs do not recreate deleted voices.
- No additional CC0 or voice-type tab is introduced.
- The pack is **not yet published**; first create/approve/export the six voices.

Tests:
`python -m pytest tests/test_starter_voice_packs.py`
`npm run build --prefix frontend`
