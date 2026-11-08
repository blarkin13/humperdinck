# Optional Humperdinck customer login (Step 2)

Free remains anonymous and works entirely offline. This change adds the **account layer** for later lifetime Pro purchase and device management, not a paid license, purchase page, or remote voice inference.

## What is in the repository

- `/account/`: black-and-white mobile-friendly website with Google/Apple sign-in, signed-in profile, explicit desktop connection approval, and logout.
- `src/account-auth.js`: the existing Cloudflare Worker handles OAuth **authorization code** (Google PKCE), OIDC signature/issuer/audience/expiry/nonce validation, secure HttpOnly cookies, hashed session tokens, CSRF checks, and short-lived desktop device authorization.
- `migrations/0001_accounts.sql`: D1 users, provider identities, hashed sessions, one-use OAuth states, pairing approvals, and temporary rate limits.
- `frontend/AccountPanel.jsx` and `backend/account_client.py`: optional system-browser sign-in from Windows, macOS, Linux, or source installs. The secret session token stays in Python's per-user data directory, never in web storage/React.
- The accounts API returns **503 / not configured** until a database and OAuth credentials are supplied. No fake login is displayed.
- Account `plan:free` is informational; actual local Free/Pro rights still use `backend/entitlements.py`. **Accounts do not activate Pro.**

## Cloudflare setup required before accounts can go live

These are one-time steps from the Humperdinck project root, using the Cloudflare account currently serving `humperdinck.studio`.

1. Create a D1 database:

   ```sh
   npx wrangler d1 create humperdinck-accounts
   ```

2. Add a real D1 binding to `wrangler.jsonc` using the database ID Cloudflare returned (do **not** invent an ID):

   ```json
   "d1_databases": [{
     "binding": "AUTH_DB",
     "database_name": "humperdinck-accounts",
     "database_id": "THE-REAL-UUID-FROM-CLOUDFLARE",
     "migrations_dir": "migrations"
   }]
   ```

   Put this as a top-level property, alongside `assets`. This binding is not pre-added to the repository because the database ID must come from your Cloudflare account.

3. Apply migrations to that **remote** database:

   ```sh
   npx wrangler d1 migrations apply humperdinck-accounts --remote
   ```

4. Create a random rate-limit pepper (at least 32 random bytes) and store it as a Worker secret; **do not commit secrets to GitHub**:

   ```sh
   openssl rand -base64 32
   npx wrangler secret put AUTH_RATE_SECRET
   ```

5. Configure provider credentials. You can start with Google and add Apple later.

   **Google**: In Google Cloud Console, create an OAuth **Web application** client, configure the consent screen, add authorized redirect URI `https://humperdinck.studio/api/account/callback/google`. Store the Web client ID and client secret as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` using `npx wrangler secret put NAME` for each.

   **Apple**: Requires an Apple Developer account, a configured Sign in with Apple Services ID, associated web domain `humperdinck.studio`, and return URL `https://humperdinck.studio/api/account/callback/apple`. Store `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` (contents of the downloaded .p8) as Worker secrets. Apple web login uses a form-post callback; this service handles that server-side.

6. Deploy your existing Worker/site via the normal Cloudflare deployment process (or `npx wrangler deploy` if you deploy manually). Verify:

   ```sh
   curl -i https://humperdinck.studio/api/account/config
   ```

   When correctly configured, `available` should be `true` and at least one provider should be enabled. Visit `https://humperdinck.studio/account/` to sign in.

## Desktop sign-in flow

1. Open Humperdinck on a desktop computer and click the account icon in the header.
2. Choose **Sign in using browser**. Python asks the Worker for a short-lived pairing request with a proof-of-possession challenge and opens the *external system browser*.
3. Log in with Google or Apple. The web account page shows a confirmation requiring a deliberate **Connect this computer** click.
4. The desktop polls with the private verifier and receives a one-time, revocable session token. It is stored under the user's normal Humperdinck application data directory.
5. Local narration keeps working, even if the website/account service later becomes unavailable.

**Important**: Signing out attempts to revoke the server session. If offline, it erases the local copy but cannot revoke remote access until its session expires (90 days maximum). The desktop token is stored in a per-user `account-session.json` with POSIX 0600 permissions (or the Windows per-user AppData ACL). Before commercial launch, an OS keychain integration is recommended.

## Security and privacy reminders

- Don't ever send a model file, project, voice reference recording or narration text with an account request.
- There is no password form in Humperdinck. Google/Apple always run in the external browser.
- Provider identity subject IDs are used to distinguish users. **Matching email addresses never automatically link distinct providers.** A secure account linking workflow can be added later.
- Only email, name, provider identity and opaque session/pairing state are stored in D1; no hardware fingerprinting.
- Sessions expire (website: 30 days; desktop: 90 days). A later signed offline Pro license is **independent** of those sessions and must never expire because an account session expired.
- Before inviting public sign-ups, complete an account-deletion and export workflow, including Apple's authorization-revocation obligations, verify moderation/retention/privacy terms, add abuse monitoring, and run real-provider end-to-end tests.
- Commercial payments, ten-device Pro activation, portable signed offline licenses and Voice Exchange are **not** implemented in this step.

## Developer validation

```sh
node --check src/account-auth.js
node --check src/model-proxy-worker.js
node --test tests/account-auth.test.mjs
python -m compileall -q backend
python -m pytest -q tests/test_account_client.py
npm run build --prefix frontend
```
