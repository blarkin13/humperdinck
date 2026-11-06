# Humperdinck public website

## Current publishing method: public GitHub binary Releases

The recommended setup is **private source repository + public `humperdinck-downloads` binary release repository**. The website now reads public release metadata through the Cloudflare Worker and links to approved download assets; **R2 is not required**. See [docs/PUBLIC_RELEASES.md](../docs/PUBLIC_RELEASES.md) for setup and publication instructions. The previous R2 instructions below remain as an alternative hosting method, but are not the active recommended workflow.


## Native binary updates without a public GitHub repository

The installed application must get its updates from the Humperdinck website, not GitHub. `backend/native_updates.py` uses the public `/downloads.json` manifest to offer newer installers for **manual** updates. `desktop/src-tauri/src/main.rs` points Tauri's **signed** updater at `https://humperdinck.larki-brian.workers.dev/updates/latest.json`.

**Automatic installation is not active for unsigned preview builds.** The Tauri updater only activates when a trusted `HUMPERDINCK_UPDATER_PUBKEY` is embedded at compilation. Until valid signed update artifacts and a signed-update JSON manifest exist, leave that build variable unset. This intentionally offers a normal website download rather than running arbitrary binaries.

### Enable fully automatic signed updates

1. Finish and test the native installers, add the appropriate operating-system signing/notarization (Windows code signing and macOS Developer ID/notarization), and complete bundled third-party license compliance.
2. Generate the Tauri updater signing key pair, retain the private key exclusively in protected CI secrets, and embed **only** the updater public key in the compiled app via `HUMPERDINCK_UPDATER_PUBKEY`. Never commit the private key.
3. Produce platform-specific **updater artifacts** in addition to normal installation files. Windows updates can use a signed NSIS updater bundle; macOS uses the Tauri updater's signed archive (not just the .dmg); Linux Tauri updater is normally AppImage-based, not a .deb replacement. Plan a separate, distro-appropriate update path for the .deb edition, or publish an AppImage edition for built-in automatic updates.
4. Upload versioned updater artifacts and their detached Tauri updater signatures to private Cloudflare R2. Use checksums and immutable paths, and verify each file exists before publication.
5. Publish `/updates/latest.json` with the Tauri v2 updater schema, including `version`, `notes`, `pub_date`, and platform keys whose `url` points to first-party hosted updater artifacts and whose `signature` contains the **actual detached updater signature**. Do not invent signatures or reuse file hashes as signatures.
6. Test upgrading an earlier signed installation on real macOS and Windows hardware while keeping the user's application data and downloaded models. Test Linux according to the chosen packaging/update mechanism.
7. Only then enable `HUMPERDINCK_UPDATER_PUBKEY` in production build CI and release a signed version that can update itself.

The same website can continue offering the regular .exe, .dmg and .deb installers via `/downloads.json`. **Those public installer files are not interchangeable with signed Tauri updater bundles**. The updater must verify signatures cryptographically before installing, and users must approve installation. Failure should leave the existing app functional.

### Private GitHub development

GitHub may remain the private source code and CI system. First confirm that Cloudflare's GitHub integration still has access to the private repository and that your plan supports private-repo builds; reauthorize if necessary. Do not switch visibility until the website deployment, CI credentials and public hosted assets are decoupled from anonymous GitHub URLs. Public users should not be offered `git clone` once the repository becomes private; remove or relabel the developer-source disclosure before switching visibility.

## Direct desktop downloads (Windows, macOS and Linux)

The homepage now has a dedicated downloadable-app section, not a prominent GitHub install call-to-action. The optional clone command is in a disclosure for developers.

**Publication is intentionally gated:** The cards only become clickable after valid installer files are uploaded and `website/downloads.json` identifies them with `published: true`. No release-only GitHub URLs or 14-day Actions artifacts should be used as public download endpoints.

### One-time hosting setup

Use Cloudflare R2 for installer binaries (typically too large for a regular Workers static-asset upload). The Worker streams published binaries at `https://humperdinck.larki-brian.workers.dev/downloads/FILENAME`, so users remain on your domain.

1. Create a private R2 bucket called `humperdinck-downloads` in the Cloudflare dashboard.
2. Add an **R2 bucket binding** to the Humperdinck Worker named **`INSTALLER_BUCKET`**, pointing at that bucket. For a Wrangler-managed binding, add `"r2_buckets": [{"binding":"INSTALLER_BUCKET","bucket_name":"humperdinck-downloads"}]` to `wrangler.jsonc` **after** creating the bucket; do not add it earlier or deploys may fail. Since Wrangler deploy configuration is authoritative, prefer storing the binding in `wrangler.jsonc`.
3. Run the native desktop build workflow and download the successful Windows .exe, macOS Apple Silicon .dmg, and Linux .deb from CI for testing. These are **unsigned preview packages**, not yet signed production distributions; the build/test and licenses must be reviewed before making them public.
4. Upload each vetted installer to R2 using exact filenames, for example `humperdinck-windows-x64-0.1.0.exe`, `humperdinck-macos-arm64-0.1.0.dmg`, `humperdinck-linux-x64-0.1.0.deb`. Keep each file at the bucket root. Do not upload arbitrary filenames or overwrite files that users may have already downloaded.
5. Verify the same-domain download path with a HEAD request and check its size and status. Test actual installation on the corresponding operating system.
6. Edit `website/downloads.json` for each verified platform:

```json
{
  "windows": {
    "published": true,
    "version": "0.1.0",
    "url": "/downloads/humperdinck-windows-x64-0.1.0.exe",
    "size": "120 MB"
  },
  "macos": {"published": false, "version": "", "url": "", "size": ""},
  "linux": {"published": false, "version": "", "url": "", "size": ""}
}
```

7. Deploy website and Worker together. The public script validates the manifest and enables only links under this site's `/downloads/` path, with the correct extension. Update build/publishing automation later to create and upload versioned assets, verify checksums and tests, and change the manifest only after upload succeeds.

The Worker sends `Content-Disposition: attachment` and streams the file from R2. No app binary is committed to Git. Without a configured binding or uploaded object, the route fails explicitly instead of redirecting users to GitHub.

**Deployment is not complete just because the website code is merged.** Until the bucket, installer uploads, and manifest are configured, the site accurately displays **Not available yet**. GitHub can remain the source-development/CI host while public downloads move to Humperdinck's own website. Removing GitHub entirely would require moving source hosting and CI as a separate project.


This folder is the **public Cloudflare Pages website**, completely separate from the desktop React/FastAPI application under `frontend/` and `backend/`.

## What works

- Responsive black-and-white landing page and navigation.
- Official Humperdinck Modern H/microphone logo reused from the desktop app.
- Real GitHub repository and installation-guide links.
- Product, narration, voiceover, and local-first descriptions.

## Planned, not yet implemented

- Online account signup/login: requires authentication, user-data storage and an account service.
- Interactive Kokoro voice samples: requires rights-cleared prerecorded sample audio files and a player, or a separately hosted inference service.
- Packaged installers: links must only appear once valid releases for macOS/Windows/Linux are published.
- Online voice cloning is **not** part of this static deployment.

The page is intentionally clear about these limitations and does not show fake buttons or claim a demo plays audio.

## Deploy with Cloudflare Pages (Git integration)

1. Merge the website pull request into `main`.
2. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Authorize GitHub and choose `blarkin13/humperdinck`.
4. Set:
   - **Project name:** `humperdinck` (or another available project slug)
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Root directory:** `website` (advanced setting)
   - **Build command:** leave blank, or `exit 0` if the dashboard requires it
   - **Build output directory:** `.` (the root directory is already `website`)
   - **Environment variables:** none
5. Deploy. Pages will serve `website/index.html` and `website/assets/*`.
6. The result should be a `*.pages.dev` URL. Connect a custom domain only when desired.

**Do not use `npx wrangler deploy`**: that command targets a Workers-style setup and is not needed for this static Pages website. No Python, Node build, or locally installed TTS engine is used for the website.

## Development

Run a static web server from this directory, for example:

```bash
cd website
python3 -m http.server 8788
```

Open http://localhost:8788 .

The site intentionally uses root-relative `/assets/`, `/styles.css` and `/script.js` URLs. Serve from the `website` root, not a subpath.

## Follow-on work

To add an actual Kokoro audio demo, generate properly licensed example clips using the local model, add the files under `website/assets/samples`, and wire up an accessible `<audio>` player. No AI backend is required for playback of prerecorded clips.

To add account registration, plan authentication, database, rate limiting, and data protection explicitly before enabling public forms.

## Website branding refresh

The website hero uses the **high-resolution silver H-and-microphone logo**. The browser favicon and Apple touch icon use the **teal-and-gold retro microphone emblem**. The social sharing preview uses an original 1200×630 JPG card based on the silver emblem.

To finish this change, upload these five binary images to `website/assets/` **on branch `website/high-res-brand-and-social-preview` before merging**:

- `hero-logo.webp` — 1024×1024 transparent silver logo for the large homepage hero
- `favicon-32.png` — small browser tab icon
- `favicon-192.png` — high-resolution browser icon
- `apple-touch-icon.png` — iOS home-screen icon
- `og-image.jpg` — 1200×630 social preview card for Open Graph and Twitter

The assets are packaged separately as `humperdinck-branding-assets.zip` in the ChatGPT conversation where these changes were made. Extract that ZIP and add its five files through GitHub's **Add file → Upload files** into the branch's `website/assets/` folder. The source HTML in this branch already references these filenames. **Do not merge until all five files are present.**

The current Open Graph absolute URL points to `https://humperdinck.larki-brian.workers.dev/assets/og-image.jpg`. Update the share URL when adding a custom domain. Social platforms may cache a previous share preview; re-scrape the URL after deployment if necessary.

## Interactive browser studio (React preview)

The public homepage links to `/studio/`, which uses the actual desktop React source code, fonts, themes and voice-card component in **public preview mode** (`VITE_PUBLIC_STUDIO=1`). Visitors can navigate tabs, browse a representative set of Kokoro presets, configure sliders, and draft narration; the preview does **not** call the Python backend. Audio generation, preview playback, voice upload, saving, installs and video rendering stay greyed out with desktop download guidance.

Do not expose `/api/` or deploy `backend/` in Cloudflare. For the public site we only compile the React frontend into static assets.

### Cloudflare Workers Builds settings

The old no-build deploy command is insufficient once the studio is introduced. In **Workers & Pages → humperdinck → Settings → Builds**, set:

- Build command: leave blank
- **Deploy command:** `bash scripts/build-public-studio.sh && npx wrangler deploy --assets ./website --name humperdinck --compatibility-date 2026-11-03`
- Root directory / Path: `/`
- Preview command: keep its existing setting

The shell script runs `npm ci` from `frontend/package-lock.json`, produces a Vite bundle with base `/studio/`, then copies it into `website/studio/` for the existing Wrangler asset upload. It does not touch the desktop app's normal build. This script is also suitable as a standalone local build command from the repository root:

```bash
bash scripts/build-public-studio.sh
```

**Update the Cloudflare deploy command before attempting to use `/studio/`**. The public site still works as a landing page until the new build command is applied. Never commit `website/studio` generated assets; they are deployment artifacts.

## Working public Kokoro audio demos

The landing page and /studio/ Voice Library now play **real Kokoro-generated prerecorded audio examples** in the browser. The public MP3s are hosted by the Hangry Labs KokoroTTS project, not by Humperdinck's Cloudflare worker. Original examples and attribution: https://github.com/hangry-labs/kokoroTTS/tree/main/examples .

This feature requires an Internet connection to retrieve sample files from raw.githubusercontent.com. It does not load Kokoro models, allow arbitrary text-to-speech, or send user text to Hangry Labs; demo clips contain fixed text. If the external samples become unavailable, the players report an audio playback error; move to Humperdinck-owned voice recordings after verifying redistribution rights and generating the samples.

To enable **live typed-text Kokoro generation** in the public site, add a separately tested Kokoro inference mechanism (browser-side Kokoro ONNX/Transformers.js, with an initial model download, or a secured hosted TTS service). Don't silently route this through the desktop FastAPI backend.

## Live Kokoro browser inference (limited public demo)

The Studio Voice Library includes a live Kokoro text-to-speech demonstration implemented in `frontend/BrowserKokoro.jsx` and `website/kokoro-worker.mjs`. It is **not** powered by a Cloudflare inference service: visitors download a quantized Kokoro ONNX model and generate audio locally in a WebAssembly Web Worker. The model library is pinned to `kokoro-js@1.2.1`, loaded as an ESM CDN module from jsDelivr, and model weights come from Hugging Face.

- Maximum **500 Unicode characters per generation**, enforced both in the text field and by the Worker.
- One model is shared for repeated requests on the page (no repeated model loads until the page is closed).
- Select any of 12 built-in Kokoro voice IDs, click Generate, then play or download WAV from a browser object URL.
- Progress reporting during the initial model download, and a Stop/reset action to terminate the Worker if a device struggles.
- Voice cloning, model installation, uploads, full multi-voice rendering, and video editing remain desktop-only.
- First use can download hundreds of MB; expect slower inference on devices without WebGPU. This implementation explicitly uses q8 + WASM for broad browser support. It is a performance-sensitive beta: browser RAM, networking, CDN blocking, device OS and model load errors will vary. For a production release, bundle and self-host the JavaScript dependencies and test multiple browsers.
- User-generated text and audio never go to Humperdinck's server or Cloudflare API; loading the browser code/model requires third-party CDN/model-host access. No usage quotas or visitor tracking are imposed here because inference is local. **500 characters is a per-request limit, not a per-day limit.**

Cloudflare's existing production build/deploy command is unchanged. The static worker file is deployed directly from `website/` and the React UI is bundled by `scripts/build-public-studio.sh`.

## Browser narration loader update

The public Studio keeps **Voice Library** separate from **Narration Studio**. The library browses/selects voices and plays fixed samples; the live 500-character generation interface is under Narration Studio only. Marketing sections avoid positioning Humperdinck as a Kokoro-specific product.

The prior public release imported the voice engine directly from jsDelivr in a cross-origin module worker. This can fail during module initialization, leaving only a generic "Load failed" error. The new code imports the pinned `kokoro-js@1.2.1` npm dependency from `frontend/KokoroWorker.js`; Vite bundles it as a same-origin worker referenced through `new URL(..., import.meta.url)`. The browser still obtains model weights from Hugging Face. Error messages include download/model initialization vs synthesis stage, to distinguish model failures from worker startup failures.

This change updates `frontend/package.json`. The Cloudflare build script and CI temporarily use `npm install` rather than `npm ci` so the existing lockfile can be reconciled during builds. Once network-enabled npm access is available, regenerate and commit `frontend/package-lock.json`, then return both build steps to `npm ci` for reproducibility. Do not assume CI compilation guarantees inference works on Safari: test a short generation on the real deployed site.

## Single-source Studio parity and cache busting (November 2026)

The public /studio/ app now **uses the same React `App` component** as the desktop app (`frontend/src.jsx`) rather than maintaining a separate `PublicStudio.jsx` copy. Both routes use the same header, main navigation, theme picker, VoiceGrid, Voice Creator controls, and other shared styling. In the web build, only **six Kokoro voices** are offered, and custom voice generation, uploads, model installation and video processing are locked. Browser narration generation stays under **Narration Studio**, not Voice Library.

The public build uses `VITE_PUBLIC_STUDIO=1`, preventing desktop FastAPI requests; the installed desktop app continues using the ordinary `App` component with all of its functionality. The website's main landing page is separate from the app UI; it is the public **/studio/** route that shares the desktop UI source.

### Cache invalidation and diagnosing stale deployments

- Vite generates fingerprinted JavaScript/CSS assets under `website/studio/assets/` on each changed bundle.
- Workers static assets honor `website/_headers`: HTML pages, the site script, and `build.json` are `Cache-Control: no-store`. Fingerprinted assets may be cached for one year because their URLs change as content changes.
- The build embeds the Git commit short SHA in the Studio preview banner, and writes `website/build.json` for a machine-readable live deployment revision. The homepage footer shows that revision.
- `scripts/build-public-studio.sh` stamps every `/studio/` link in the homepage with `?v=<sha>`, forcing a fresh navigation URL after deployment.
- Verify Cloudflare deployed the same SHA as GitHub by opening `https://humperdinck.larki-brian.workers.dev/build.json` and comparing with the version in the public Studio banner. `build.json` does **not** exist in Git; it is generated at deploy time.

The static homepage remains a separate marketing website. The statement about matching the desktop applies only to the /studio/ app shell and shared components; browser preview restrictions necessarily change some controls, and production visual comparison on Safari/Chrome should be done after deployment before claiming pixel-for-pixel parity.

## Browser voice previews and engine loading (November 4)

The browser Voice Library **no longer fetches any Hangry Labs MP3 sample**. Clicking a built-in voice's preview/test icon selects that voice and opens Narration Studio for real speech generation using visitor-entered text; the existing 500-character limit remains. The marketing homepage no longer embeds MP3s or the sample attribution paragraph. Apache-2.0 notices for the actual runtime/model remain available at `/THIRD_PARTY_NOTICES.txt` rather than occupying UI space.

Browser model initialization had reported `Load failed` under Safari, but the generic error could mean a blocked third-party download or ONNX WASM loading. The public build now copies the installed `ort-wasm-simd-threaded.jsep.wasm` binary into `/studio/wasm/`, and `frontend/KokoroWorker.js` sets the official `kokoro-js` `env.wasmPaths` override to load it from Humperdinck's own domain. It also diagnoses Hugging Face `config.json` and quantized ONNX HEAD status on failure; the model weights still come from Hugging Face, so network blocking of that host can still prevent generation. Real Safari/browser inference must be checked after deployment.

## Same-origin Kokoro model proxy (November 4, 2026)

The browser Studio now requests public Kokoro model files under `/model/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/`. `src/model-proxy-worker.js` forwards only paths for this specific model to Hugging Face, streaming responses back through the same origin. Audio and user text stay in the browser. No R2 bucket or inference service is required. The existing static website and app UI remain unchanged.

**Required one-time deployment configuration change:** In Cloudflare **Workers & Pages → humperdinck → Settings → Builds**, replace the previous Deploy command:

```bash
bash scripts/build-public-studio.sh && npx wrangler deploy --assets ./website --name humperdinck --compatibility-date 2026-11-03
```

with:

```bash
bash scripts/build-public-studio.sh && npx wrangler deploy
```

Leave the build root set to the repository root. The committed `wrangler.jsonc` now supplies the same Worker name, static asset directory and the new `main` entry point, with routing limited to `/model/*`. **If Cloudflare still runs the old deploy command, the new server endpoint will not be activated.**

After deploying, open:

`https://humperdinck.larki-brian.workers.dev/model/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/config.json`

Expected: JSON with `"model_type": "style_text_to_speech_2"`. A 404 means this proxy was not deployed or the upstream returned 404; a 502 means Cloudflare couldn't retrieve the upstream. Check Worker logs and the actual deployment revision, not just the UI build banner. Then test a short generated sentence under Narration Studio in Safari and Chrome.

The Worker allows only safe paths under the one public model, forwards no browser cookies, and sets one-day caching on successful responses. It streams ONNX data without embedding the model inside Cloudflare's limited-size static assets. This implementation must still be verified with a real model download and speech generation after deployment.
