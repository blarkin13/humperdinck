# Humperdinck — private owner analytics

Status: code prepared; **not operational until owner settings are configured and live deployment is verified**.

The account page reveals the Owner Analytics panel only after `GET /api/account/dashboard/analytics` succeeds for an authenticated **web** session whose immutable account UUID equals `ANALYTICS_OWNER_ACCOUNT_ID`. Other users receive HTTP 404, and unauthenticated visitors receive 401. The page never receives Cloudflare credentials.

## Secrets/configuration to add to the production Cloudflare Worker

- `ANALYTICS_OWNER_ACCOUNT_ID`: owner's exact `auth_users.id` UUID from the account dashboard. Do not use a display name, email address, or customer-managed account label.
- `CF_ANALYTICS_ACCOUNT_ID`: Cloudflare account ID (32 lowercase hex characters).
- `CF_ANALYTICS_READ_TOKEN`: **secret**, limited to Account Analytics Read for the relevant account. Never use a Global API Key or put this in code, documentation, GitHub Actions logs or frontend JavaScript.
- `GITHUB_DOWNLOADS_TOKEN` (optional, **secret**): a fine-grained GitHub token with read-only access to public repositories. Without it the GitHub API often rate-limits Cloudflare's shared IPs and the dashboard shows "GitHub release counts are unavailable (HTTP 403, rate limited)". Set with `npx wrangler secret put GITHUB_DOWNLOADS_TOKEN`.

The existing `ANALYTICS` binding writes to dataset `humperdinck_site_events`; the new endpoint reads its aggregates with Cloudflare Workers Analytics Engine's **original** account-scoped SQL API. Missing/invalid credentials display an unavailable state rather than invented zeros.

## Sources and interpretation

- **Website page views**: `page_view` anonymous events recorded by existing website script, not unique visitors. Compare with Cloudflare **Web Analytics** for unique visitor estimates. The two products measure differently.
- **Download clicks**: `download_click` anonymous events by OS over the selected rolling 24h/7d/30d window. They are not successful downloads.
- **GitHub downloads**: cumulative public `download_count` for published Windows EXE, macOS DMG and Linux DEB/RPM/AppImage release assets in the first 100 releases (excluding the `voices` release, drafts, prereleases and checksums). These include downloads made outside the website, and are **all-time**, unaffected by period selection. Counts are not unique people or installed users.
- **No Pro sales metric is displayed yet.** Source-of-truth sales reporting requires a vetted production commerce ledger; sandbox orders must not be misrepresented as revenue.
- No visitor IPs, cookies, audio, scripts, local project contents or unique installation identifiers are collected by this feature.

## Acceptance steps

1. Set the owner UUID and Cloudflare Analytics Engine read credentials on the Worker through a secure operator-controlled path.
2. Deploy the reviewed exact Git commit only under the existing release/deployment controls.
3. With owner account signed in, open `/account/`, select Site analytics and verify 1/7/30-day data. Inspect DevTools: all account analytics responses must be `Cache-Control: no-store` and contain no credentials.
4. Sign into another ordinary customer account, and then sign out: the panel must be hidden and direct route requests must fail (404 or 401).
5. Compare Cloudflare event counts and cumulative GitHub release asset counters to their respective provider dashboards. Trigger one consent-free website download click and verify eventual aggregation after provider processing.
6. Open on phone, keyboard, and 200% zoom; verify labels, responsive layout and failure messages.
7. Confirm live analytics works after Cloudflare API token rotation; revoke immediately if leaked.

CI tests: `tests/owner-analytics.test.mjs`. These are synthetic. Do **not** mark DEPLOYED, LIVE or COMPLETE until real provider query, owner access, negative-access tests and mobile acceptance have been recorded.
