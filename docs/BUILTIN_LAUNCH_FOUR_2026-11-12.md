# Built-In Humperdinck Voices — final launch scope (owner decision, November 12, 2026)

**Exactly four built-in voices for the full public launch: Sarah, Jason, Kenny, and Jerry.** No additional built-in voices are planned until **well after** full launch; do not add fifth/seventh voices to the build, testing acceptance, website copy, license ledger, installer pack, or launch goals.

The previous seven-voice published ZIP and associated required counts are **historical and superseded**. The new launch pack is a distinct artifact; do not overwrite the old tag/asset or treat CI's old seven-pack success as evidence of four-pack deployment.

## Actual supplied inputs and local four-voice build (November 12, 2026)

| Built-in voice | User-supplied file | Source file SHA-256 | Installer reference WAV SHA-256 |
| --- | --- | --- | --- |
| Sarah | Sarah.wav | `02739b572307f147d833029e5d2dc2be00e0b8f7d4011ef6727493d2365712ef` | same as source |
| Jason | Jason.wav | `a2778333d4b14b909c8c03e1170c384ec68aeca33ed12530edfa70767faffd68` | same as source |
| Kenny | Kenny.mp3 | `07e277a75a1fb66f54f5e07e80389dcdc750ea5831d2850237ea897b99ccbb86` | `b72fde26475138112ebd807cbbe409c968c0292c78d8e46e133c1949c305ade3` |
| Jerry | Jerry.wav | `f862f358145c9dfd82830fc5ce3393545b68d0ce566f7093b845606890becf72` | same as source |

For Kenny, the supplied 24 kHz mono MP3 was decoded into **24 kHz, mono 16-bit PCM WAV** for the pack, using FFmpeg. The other three WAV files were included without audio transcoding. Each resulting sample was checked as 24 kHz mono and between 1 and 60 seconds.

**Local release-candidate ZIP:** `humperdinck-builtin-voices-launch-four-v1.zip`, 615,819 bytes, SHA-256 `59086a4e9b53eec23f7d33b3acd6a10d1e5a1328ee80eaf93b59218f29038d38`.

**Manifest:** format `humperdinck-starter-voices`, version 1, **revision 2**, four names above, and four sample WAV files at stable `samples/<uuid>.wav` paths. Revision 2 is deliberate: the installer can remove previous built-in samples no longer included while preserving personal voices. The reference text is the existing launcher default sentence, "The old lighthouse stood quietly above the waves, waiting for the next storm." **Transcripts verified:** on November 12, 2026 the owner confirmed that each of the four samples says the manifest reference text.

## Release distribution — outstanding deployment step

1. **Operator** uploads the verified *exact* ZIP to GitHub Releases under the new tag **`builtin-humperdinck-voices-launch-four-v1`** with asset name `humperdinck-builtin-voices-launch-four-v1.zip`. The uploaded release should be discoverable at:
   `https://github.com/blarkin13/humperdinck/releases/download/builtin-humperdinck-voices-launch-four-v1/humperdinck-builtin-voices-launch-four-v1.zip`
   This is the **intended destination**, not a verified live URL. Do not claim upload occurred until confirmed.
2. Compare the GitHub-uploaded asset checksum to `59086a4e9b53eec23f7d33b3acd6a10d1e5a1328ee80eaf93b59218f29038d38`. `scripts/prepare_native_voice_pack.py` and `scripts/install_voice_pack.py` fail closed on a mismatch, unknown name, wrong version/count or unexpected revision.
3. Run native unsigned preview CI and real clean-install tests on Windows, macOS and Linux. Verify that exactly four public built-ins appear, that prior seven-voice installs migrate to four safely, and that personal/user-created voices are never deleted.
4. Listen to the installed samples and confirm exact narration reference text, cloning behavior and names. Merely verifying four file hashes does not prove usable voice identity or audio correctness.
5. Before commercial release, complete the separate **third-party** source/CC0/license/NOTICE, Qwen model and frozen binary rights review. `docs/RELEASE_RIGHTS_APPROVAL.json` stays **BLOCKED** until that verification.

## Rights / model provenance

The owner previously confirmed that the launch voices were generated from his own recorded voice blended with Qwen. A self-signed performer release is **not** needed. The technical record now tracks exactly these four identities and samples. Any additional third-party input or different Qwen model license must be reviewed on its own merits.

**Launch rule:** Do not ask Brian to supply or create three additional voices. The four-file scope is final for launch, and expansion is deliberately deferred until well after launch.

## Repin (November 12, 2026, Claude, owner-approved)

The original release-candidate ZIP was not available on the operator Mac, so the pack was rebuilt reproducibly from the owner's four source files (all four source SHA-256 values above matched) with `scripts/build_launch_four_voice_pack.py`: fixed ZIP timestamps and order, voice IDs `uuid5("humperdinck:starter-voice:launch-four:<name>")`, revision 2, and Kenny decoded with FFmpeg bit-exact flags. Two builds gave identical bytes. The pinned values above are updated to the rebuilt pack (615,819 bytes; Kenny WAV `b72fde26…`). Owner confirmed the four transcripts the same day.
