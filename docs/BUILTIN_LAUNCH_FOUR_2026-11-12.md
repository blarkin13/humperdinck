# Built-In Humperdinck Voices — final launch scope (owner decision, November 12, 2026)

**Exactly four built-in voices for the full public launch: Sarah, Jason, Kenny, and Jerry.** No additional built-in voices are planned until **well after** full launch; do not add fifth/seventh voices to the build, testing acceptance, website copy, license ledger, installer pack, or launch goals.

The previous seven-voice published ZIP and associated required counts are **historical and superseded**. The new launch pack is a distinct artifact; do not overwrite the old tag/asset or treat CI's old seven-pack success as evidence of four-pack deployment.

## Actual supplied inputs and local four-voice build (November 12, 2026)

| Built-in voice | User-supplied file | Source file SHA-256 | Installer reference WAV SHA-256 |
| --- | --- | --- | --- |
| Sarah | Sarah.wav | `02739b572307f147d833029e5d2dc2be00e0b8f7d4011ef6727493d2365712ef` | same as source |
| Jason | Jason.wav | `a2778333d4b14b909c8c03e1170c384ec68aeca33ed12530edfa70767faffd68` | same as source |
| Kenny | Kenny.mp3 | `07e277a75a1fb66f54f5e07e80389dcdc750ea5831d2850237ea897b99ccbb86` | `806cbe1774b052f395b1980e7f8283b06cef2f0a2b9988f77c3a332844ca31c1` |
| Jerry | Jerry.wav | `f862f358145c9dfd82830fc5ce3393545b68d0ce566f7093b845606890becf72` | same as source |

For Kenny, the supplied 24 kHz mono MP3 was decoded into **24 kHz, mono 16-bit PCM WAV** for the pack, using FFmpeg. The other three WAV files were included without audio transcoding. Each resulting sample was checked as 24 kHz mono and between 1 and 60 seconds.

**Local release-candidate ZIP:** `humperdinck-builtin-voices-launch-four-v1.zip`, 615,648 bytes, SHA-256 `6cc0ec3b6e6f85561532514795897036b86d3a601a43403f21c0570a03dc245f`.

**Manifest:** format `humperdinck-starter-voices`, version 1, **revision 2**, four names above, and four sample WAV files at stable `samples/<uuid>.wav` paths. Revision 2 is deliberate: the installer can remove previous built-in samples no longer included while preserving personal voices. The reference text is the existing launcher default sentence, "The old lighthouse stood quietly above the waves, waiting for the next storm." **The actual spoken transcript of each uploaded clip has not been verified.** Before publishing, listen and verify that each sample actually says the manifest reference text, or correct the pack source and repin the asset.

## Release distribution — outstanding deployment step

1. **Operator** uploads the verified *exact* ZIP to GitHub Releases under the new tag **`builtin-humperdinck-voices-launch-four-v1`** with asset name `humperdinck-builtin-voices-launch-four-v1.zip`. The uploaded release should be discoverable at:
   `https://github.com/blarkin13/humperdinck/releases/download/builtin-humperdinck-voices-launch-four-v1/humperdinck-builtin-voices-launch-four-v1.zip`
   This is the **intended destination**, not a verified live URL. Do not claim upload occurred until confirmed.
2. Compare the GitHub-uploaded asset checksum to `6cc0ec3b6e6f85561532514795897036b86d3a601a43403f21c0570a03dc245f`. `scripts/prepare_native_voice_pack.py` and `scripts/install_voice_pack.py` fail closed on a mismatch, unknown name, wrong version/count or unexpected revision.
3. Run native unsigned preview CI and real clean-install tests on Windows, macOS and Linux. Verify that exactly four public built-ins appear, that prior seven-voice installs migrate to four safely, and that personal/user-created voices are never deleted.
4. Listen to the installed samples and confirm exact narration reference text, cloning behavior and names. Merely verifying four file hashes does not prove usable voice identity or audio correctness.
5. Before commercial release, complete the separate **third-party** source/CC0/license/NOTICE, Qwen model and frozen binary rights review. `docs/RELEASE_RIGHTS_APPROVAL.json` stays **BLOCKED** until that verification.

## Rights / model provenance

The owner previously confirmed that the launch voices were generated from his own recorded voice blended with Qwen. A self-signed performer release is **not** needed. The technical record now tracks exactly these four identities and samples. Any additional third-party input or different Qwen model license must be reviewed on its own merits.

**Launch rule:** Do not ask Brian to supply or create three additional voices. The four-file scope is final for launch, and expansion is deliberately deferred until well after launch.
