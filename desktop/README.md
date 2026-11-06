# Humperdinck native desktop — initial unsigned build

This is an **initial native shell and packaging path**, not a completed public
release. The existing source-based web installer continues to work.

## Architecture

- Tauri v2 supplies an actual Windows, macOS or Linux application window.
- A PyInstaller one-file **sidecar** packages FastAPI and the compiled React UI.
- The sidecar binds to a random port on **127.0.0.1 only**; the native window and
  **Open in Browser** menu use the same local URL, data directory and backend.
- Projects, recordings, and output files live in the OS-specific application data
  directory instead of the replaceable installer folder.
- The desktop UI no longer needs a Vite development server or Node.js at runtime.
- LAN/remote personal-server access is **not enabled**; that requires a separate
  authenticated design, pairing, and secure remote transport.

## CI outputs

Run the **Unsigned native desktop packages** GitHub workflow or open a PR that
touches the native packaging files. Each platform builds its own sidecar and
unsigned test installer:

- Windows x64: NSIS **.exe**
- macOS Apple Silicon: **.dmg** containing Humperdinck.app
- Linux Ubuntu/Debian x64: **.deb**

Build artifacts appear on the workflow run; no GitHub Release is created, and
no signing keys are required. macOS uses ad-hoc signing for testing only.

**macOS library-validation fix:** The PyInstaller one-file server extracts its
Python.framework into a temporary directory. Tauri's final app-signing step
can leave that framework signed with a different identity than the server,
causing macOS to reject it with `mapping process and mapped file ... have different Team IDs`.
Tauri's macOS bundler currently applies the app entitlement but does
**not** preserve it on the external PyInstaller sidecar. For the unsigned CI
preview, the workflow mounts the DMG, copies the app, ad-hoc re-signs
`Contents/MacOS/humperdinck-server` with the narrowly targeted
`com.apple.security.cs.disable-library-validation` entitlement from
`src-tauri/entitlements.plist`, re-signs the enclosing app, rebuilds the
test DMG and verifies both its code signature and **real embedded Python
startup from the final DMG**. This is not a substitute for Developer ID
release signing or notarization; their final signing process also needs
to preserve the helper entitlement. A successful server test alone does not
prove the native GUI opens, so perform a Finder launch test as well.

## Local build prerequisites

Build on the target OS (cross-compilation of a PyInstaller executable is not
supported). Install Python 3.11/3.12, Rust, Node.js, the Tauri OS dependencies,
and a PyInstaller-compatible Python environment.

```sh
cd frontend
npm install --no-audit --no-fund
npm run build
cd ..
python -m pip install -r backend/requirements.txt "pyinstaller>=6,<7" "kokoro-onnx>=0.6,<1" "certifi>=2025.1"
python scripts/prepare_native_voice_pack.py
python scripts/build_native_sidecar.py --target <rust-target-triple>
python scripts/smoke_native_server.py --target <rust-target-triple>
cd desktop
npm install --no-audit --no-fund
npx tauri icon ../frontend/public/humperdinck-favicon-512.png
npx tauri build --bundles <nsis|dmg|deb>
```

Choose one target: `x86_64-pc-windows-msvc`,
`aarch64-apple-darwin`, or `x86_64-unknown-linux-gnu`.

## What still needs work

**The native preview includes the lightweight Kokoro ONNX CPU runtime.**
Model weights are not bundled. Download a Kokoro voice in Models once to the
shared cache, then preset narration can run in native and browser interfaces.
All seven approved **Built-In Humperdinck Voices** reference samples are now
bundled directly with native installers. They are imported on first launch into
per-user voice storage (without overwriting, restoring deletions, or exposing
source recordings). The native app hides the pack-publishing tools, which are
for the source/developer installation. These are Qwen reference clips, not
independent models; arbitrary new narration with them still requires Qwen Base,
which is NOT yet packaged in this native preview.
Qwen custom cloning/design and GPL-licensed Piper are not in the native
runtime yet. The source-code updater is disabled in native packages. Native
WAV output can work without FFmpeg, but MP3/video exports require it.
Real-device audio testing, other engines, binary updates, and signing remain
release gates.

Other release gates: real audio-generation smoke tests, migration/backup of an
existing `data/` folder, production-grade one-instance handling, signing,
macOS notarization, clean install/uninstall, and reliable upgrade behavior.

Do not expose the bundled localhost API to other computers as a shortcut to
phone/tablet access.

## Shared model storage

Native and browser/source installs under the **same operating-system user**
share model weights. Existing Qwen weights are already cached in the Hugging
Face Hub. Kokoro and Piper are now stored under:

- `~/.cache/huggingface/humperdinck/presets/kokoro/`
- `~/.cache/huggingface/humperdinck/presets/piper/`

If `HF_HOME` or `XDG_CACHE_HOME` is configured, those existing settings
take precedence. Set `HUMPERDINCK_MODEL_HOME` to use a custom shared root,
including its Hugging Face `hub/` directory. A source/browser launch safely
copies older `data/models/` presets into the shared location once, keeping
the source files and user projects intact.

This shares **model weights, not model runtimes**. The native engine runtime
still needs the next packaging phase; model compatibility is checked per OS.

## Bundled FFmpeg and ffprobe (license gate)

FFmpeg is not inherently incompatible with commercial apps, but the exact
distributed executable, configure flags, dependencies, and corresponding
source must satisfy its LGPL license. The desktop build supports **optional
vetted binaries**, keeping this review separate from core UI/server packaging.

Provide a `--ffmpeg-dir` containing:
- `ffmpeg` and `ffprobe` (or `.exe` on Windows), matched to the build OS;
- `COPYING.LGPLv2.1`, the corresponding license text;
- `ffmpeg-bundle.json` containing `license` (LGPL-2.1-or-later or
  LGPL-3.0-or-later), `source_url` pointing to **the exact corresponding source**,
  `build_configuration` copied from `ffmpeg -buildconf`, and `sha256` with
  individual hex digests for `ffmpeg` and `ffprobe`.

For example:
```sh
python scripts/build_native_sidecar.py --target aarch64-apple-darwin \
    --ffmpeg-dir /path/to/reviewed-ffmpeg
```

The packager refuses GPL/nonfree-enabled configurations, missing source
provenance, and hash mismatches. Executables and license metadata are placed
inside the sidecar; it adds their private directory to PATH at runtime, so
existing FFmpeg calls work without a system installation. A bundled
**LGPL-only build may omit libx264**; Video Studio falls back to FFmpeg's
built-in MPEG-4 Part 2 encoder when H.264 is unavailable.

**Before publishing a customer build:** document exact build flags and source
distribution, provide FFmpeg source and required notices, verify runtime codec
support and licenses of linked libraries, and test each OS. CI currently builds
the unsigned shell **without** bundled FFmpeg until reviewed executables are
provided. Do not infer that system-installed or random downloaded FFmpeg
binaries are automatically safe to redistribute.

## OS installation locations

- Windows NSIS prompts for current-user installation under LocalAppData or
  all-users installation under Program Files (requires administrator rights).
- macOS uses a DMG that installs Humperdinck.app in Applications.
- Linux DEB installs application executables and desktop entries in the normal
  system directories, not under /home. Per-user data stays in the home directory.

All three editions keep model weights outside their replaceable application
files. The shared default follows the existing user Hugging Face cache.
