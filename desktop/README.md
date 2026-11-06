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

## Local build prerequisites

Build on the target OS (cross-compilation of a PyInstaller executable is not
supported). Install Python 3.11/3.12, Rust, Node.js, the Tauri OS dependencies,
and a PyInstaller-compatible Python environment.

```sh
cd frontend
npm install --no-audit --no-fund
npm run build
cd ..
python -m pip install -r backend/requirements.txt "pyinstaller>=6,<7"
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

**This starter package does not include the large inference engines or install
them after installation.** In native builds, Models installation and the
source-tree updater are deliberately disabled rather than pretending they work.
The existing development/web install continues to offer Qwen, Kokoro and Piper.
Before a user-ready native release, package and verify a per-platform model
runtime, FFmpeg, optional model downloads, and proper updates/signatures.

Other release gates: real audio-generation smoke tests, migration/backup of an
existing `data/` folder, production-grade one-instance handling, signing,
macOS notarization, clean install/uninstall, and reliable upgrade behavior.

Do not expose the bundled localhost API to other computers as a shortcut to
phone/tablet access.
