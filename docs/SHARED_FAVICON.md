# Shared Humperdinck favicon

The hosted homepage and desktop/local React Studio use the same user-approved cream H + microphone icon on a dark rounded square.

## Install image assets before merging this branch

Download `humperdinck-favicon-pack.zip` from the ChatGPT conversation. Extract its contents, then commit these binary assets to this branch:

- `website/assets/humperdinck-favicon.ico`
- `website/assets/humperdinck-favicon-32.png`
- `website/assets/humperdinck-favicon-192.png`
- `website/assets/humperdinck-apple-touch-icon.png`
- `frontend/public/humperdinck-favicon.ico`
- `frontend/public/humperdinck-favicon-32.png`
- `frontend/public/humperdinck-favicon-192.png`
- `frontend/public/humperdinck-apple-touch-icon.png`

The ZIP also contains 16, 48 and 512-pixel variants for both destinations, and an untouched 1254-pixel master. Uploading those additional sizes is optional.

Do **not** merge the HTML-only PR before committing the binary assets above, or the new icon references will return 404. The build copies `frontend/public/*` into `website/studio/*` when deploying and does not check in generated `website/studio`.

## Verify after deploying

- Hosted homepage tab: `/`
- Hosted public Studio tab: `/studio/`
- Local Vite app: `http://127.0.0.1:5173/`
- Confirm `/assets/humperdinck-favicon-32.png` and `/studio/humperdinck-favicon-32.png` both resolve.

The filenames are new to avoid browsers continuing to reuse the previous cached favicon assets.
