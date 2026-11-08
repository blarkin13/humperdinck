# Humperdinck website and installer analytics

## What is measured

The Worker writes **aggregate, anonymous events** to Cloudflare Workers Analytics Engine, dataset `humperdinck_site_events`:

| Event | Meaning |
|---|---|
| `page_view / website / homepage` | Homepage loaded with JavaScript enabled. Not a unique-person count. |
| `download_click / windows|macos|linux / github|r2` | Someone clicked an available installer button. Not proof of completed download. |
| `download_served / windows|macos|linux / r2` | First-party R2 installer was found and a successful HTTP GET response was sent. Not proof the entire file finished transferring. |

No visitor IP address, persistent visitor ID, cookie, personal data, uploaded audio, or entered text is written into this analytics dataset. Requests may be blocked by browsers/ad blockers; bot traffic can cause inflated counts. Some events may be sampled by Cloudflare.

## Enable and verify

The binding is configured in `wrangler.jsonc` as `ANALYTICS`. Cloudflare automatically creates the dataset on the first successful write. Deploy the feature branch after review. The public homepage starts sending events when the new `script.js` deploys; the Worker routes `POST /analytics/event` to the event collector. **No public administration endpoint is exposed.**

After deploying, load the homepage, click a published download button if one exists, and check the dataset in Cloudflare **Analytics & Logs → Analytics Engine** (dashboard wording may vary). A homepage `page_view` should appear. If no installers are published, clicks will correctly remain at zero. Requests to a nonexistent installer must not count as served downloads.

## SQL reporting

In the Cloudflare Analytics Engine SQL interface, query the dataset:

```sql
SELECT blob1 AS event, blob2 AS platform, blob3 AS source,
       SUM(_sample_interval) AS estimated_events
FROM humperdinck_site_events
WHERE timestamp >= NOW() - INTERVAL '7' DAY
GROUP BY event, platform, source
ORDER BY estimated_events DESC
```

Daily website visits and download interactions:

```sql
SELECT toDate(timestamp) AS day,
       blob1 AS event, blob2 AS platform,
       SUM(_sample_interval) AS estimated_events
FROM humperdinck_site_events
WHERE timestamp >= NOW() - INTERVAL '30' DAY
GROUP BY day, event, platform
ORDER BY day DESC, event, platform
```

Counts are events, not unique people. Installer clicks are not completed downloads. R2 response counts are distinct from GitHub-hosted downloads; do not add click and served numbers together.

**GitHub Releases:** Existing historical download counts, and downloads whose binaries are served by GitHub, should be read from GitHub release asset `download_count` metrics at `blarkin13/humperdinck-downloads`. Clicking a GitHub installer records a `download_click`, while GitHub handles the actual binary delivery, so there is no `download_served` event for GitHub.

## Unique visitors / full website coverage

To measure **unique visitors** and traffic across the homepage and public `/studio/` app, set up **Cloudflare Web Analytics** for `humperdinck.studio` from the Cloudflare dashboard. Add the generated site-specific beacon snippet to the homepage and the public studio's Vite entry HTML, or enable auto-injection if available for your hostname. The snippet has a unique token generated in your account; it cannot be determined from the repository. Without this dashboard step, our custom dataset reports page views, not unique visitors, and it does not count Studio route changes.

Official instructions: https://developers.cloudflare.com/web-analytics/get-started/

## Deployment

Existing public-worker deployment must include the current `wrangler.jsonc` (including the Analytics Engine binding) and `src/site-analytics.js`. Do not manually paste API tokens into any public source file. No custom administrative statistics page or authentication has been deployed. View the metrics privately in your Cloudflare account.
