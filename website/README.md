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
