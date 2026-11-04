# Humperdinck public website

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
