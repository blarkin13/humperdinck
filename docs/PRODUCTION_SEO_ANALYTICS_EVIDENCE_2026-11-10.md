# Production SEO and analytics evidence — November 10, 2026

## Confirmed (read-only; no scripts or account data)

- Cloudflare `humperdinck_site_events` Analytics Engine dataset is **queryable** through account-level SQL.
- Real anonymous aggregate event counts from the query on November 10:
  - Last **24 hours**: **63** `page_view` events for `website`.
  - Last **7 days**: **240** `page_view` events and **2** Linux `download_click` events.
  - Last **30 days**: **240** `page_view` events and **2** Linux `download_click` events.
  - No Windows/macOS download-click rows returned in these time windows. This is not proof of zero successful GitHub downloads.
- Events are *not unique visitors*, completed installer downloads, or actual installs. Browser-generated clicks are self-reported, and Analytics Engine custom events are distinct from Cloudflare Web Analytics unique-visit estimates.
- Worker settings contain the write-only Analytics Engine binding but **do not** expose `ANALYTICS_OWNER_ACCOUNT_ID`, `CF_ANALYTICS_ACCOUNT_ID`, or `CF_ANALYTICS_READ_TOKEN` to the private owner dashboard. The latter remains unaccepted live until owner UUID, appropriate read-only secret and authenticated/nonowner checks are staged safely.
- Cloudflare script deployment inventory confirms a full-traffic deployment on November 10. That is not equivalent to browser visual, Search Console indexed coverage, Lighthouse, or installer-download byte verification.
- A web retrieval attempt for the live homepage, `/downloads.json`, `/updates/latest.json` and `/.well-known/humperdinck-deployment.json` was inaccessible to the browser/search tool; no PASS is inferred from those attempts. The scheduled monitor provides a new independent GitHub Actions runner check after merge.

## Owner analytics opt-out — first-party only

The site now supports a browser-local flag `humperdinck_analytics_exclude=1` set through a checkbox in the authenticated owner analytics panel. It prevents subsequent first-party `/analytics/event` page-view and download-click event sends **from that browser**. It does not identify or track the owner across browsers; opt out separately on each device/browser. It does not delete historical events, suppress Cloudflare automatically injected Web Analytics beacons, or subtract GitHub release-asset counts. Use a separate test-only download asset/channel for test installer downloads if you need reliable customer-only actual download totals.

## Remaining release acceptance

1. Independently verify public HTML, canonical and metadata in actual live browsers; record deployed exact Git SHA.
2. Obtain Search Console indexed/excluded pages and Bing indexing counts (submitting a sitemap is not evidence of indexing).
3. Run mobile and desktop Lighthouse and keyboard/200% zoom checks against the deployed site, keeping real reports.
4. Validate owner dashboard with securely configured read token and nonowner HTTP 404.
5. Compare GitHub release counters with the site's downloads listing; do not equate website clicks with completed installs.
6. Recruit independent buyers to test download→first audio→paid intent; document results rather than assuming demand.

**Status: P1 IN PROGRESS.** Source tests and cloud-side event query passed, but end-to-end consumer and deployment acceptance remain open.
