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

### Notes

- These are **cloning references**, not pre-trained speaker-specific weights.
- A generated lighthouse sample still contains a synthetic representation of
  vocal identity. Distribute only with voice owner's consent and appropriate
  rights; synthetic reference audio is not a privacy guarantee.
- Saved adjustment settings are captured as metadata; the generated reference
  has the approved adjustments already rendered into it. The installer does
  not reapply those adjustments, to avoid double processing.
- Stable exported IDs avoid duplicates. The first installer run marks the pack
  present. Repeated installs do not recreate user-deleted voices.
- No additional CC0 or voice-type tab is introduced.
- The pack is **not yet published**; first create/approve/export the six voices.

Tests:
`python -m pytest tests/test_starter_voice_packs.py`
`npm run build --prefix frontend`
