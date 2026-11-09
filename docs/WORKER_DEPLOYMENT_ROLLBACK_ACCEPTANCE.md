# P0 — Cloudflare Worker release and rollback acceptance

**Status (November 9, 2026): read-only configuration and version-history audit complete. Live rollback drill NOT performed; production deploy authorization NOT given.**

## What was verified through Cloudflare API

- Worker: `humperdinck`, deployed through Wrangler; production D1 binding: `AUTH_DB` → `humperdinck-accounts`. Runtime secrets were **not read** and their values are **not verified**.
- Most recent observed deployment: `b77e60bf-a109-4f5d-9a88-5be43ca51bb4`, November 9, 2026 at **16:44:28 UTC**; **100%** of traffic routes to Worker version **305**, `52a8c693-44a0-430f-8d51-3efe4943e5bb`.
- Immediately previous deployment: `96540104-c89c-4c8f-b7a3-6e19eda8b385`, November 9, 2026 at **16:24:42 UTC**, version **304**, `6c3c8a25-595e-4a98-a90d-3a7f5db50ce6`, previously 100% traffic.
- Both versions' metadata report Wrangler source and the same **binding names/types**, including `AUTH_DB`, `ASSETS`, the `LS_TEST_*` secrets and Pro signing-key secrets. Names **do not** prove matching secret contents, database schema, assets, or behavior.
- GitHub `main` at the time of the audit: `bad9c62c1361c7eea9101e190f946722949484d5` (PR #150). **Cloudflare version metadata did not include a verifiable Git commit SHA.** Do **not** assert that version 305 maps to this commit solely from its timestamp.
- `src/live-commerce-release-gate.js` on GitHub `main` sets `LIVE_COMMERCE_CODE_APPROVED=false`; production checkout/webhook routes are intentionally blocked with HTTP 503. This is **source-level evidence**; a live public-path HTTP smoke test is separately required before release acceptance.
- GitHub `.github/workflows/publish-desktop.yml` requires manual dispatch, a `production` environment and independently supplied exact-version/commit P0 and commercial-rights manifests before publishing installers. **This workflow does not gate ordinary Cloudflare Wrangler Worker deployments.** A desktop publisher gate must not be mistaken for a Worker deploy approval.
- D1 database point-in-time recovery is **separate** from Worker version rollback; neither rewinds the other. See `docs/D1_RECOVERY_ACCEPTANCE.md`.

## Critical finding: no pre-approved rollback target

Cloudflare retains version 304, but **it is only a candidate, not an approved recovery version**. Selecting “previous” without source identity, security-diff review and schema compatibility would risk reintroducing defects, deactivating a needed safeguard, breaking existing Pro/Google login flows, or disconnecting newer assets. As of this audit, no real Worker rollback or post-rollback smoke test has been demonstrated.

## Required safe rollback procedure — operation requires separate approval

1. **Freeze and record:** identify incident, operator, exact environment/domain, current deployment and 100%-traffic version, expected Git commit, failed checks, user-visible impact and D1 migration state. Record a D1 recovery bookmark separately; this step must be read-only.
2. **Select the known-good build:** inspect the proposed Worker version's code/build provenance, security gate, static assets and bindings. Pin its exact **Git SHA and Cloudflare version ID**; do not pick by timestamp alone. If provenance cannot be established, rebuild from a reviewed known-good commit through the normal deployment pipeline **rather than blindly switching**.
3. **Verify forward-schema compatibility:** inspect any D1 migrations and changed Worker queries since the target. A Worker rollback **does not undo D1 migrations**, merchant webhooks, issued offline certificates or refunds. If the older code cannot safely read the current schema/data, **STOP** and select an explicitly compatible build.
4. **Prior to switching traffic, perform source-level tests** for expired sessions, signed webhooks, account deletion safeguards, Pro entitlement reconciliation, cross-origin writes and the default-off production commerce interlock. If staged/testing environment is available, verify the candidate there with separate non-production credentials.
5. **Owner/operator release approval:** record the incident, exact candidate version and commit, rollback reason, acceptance evidence, rollback operator, emergency communications and authorized maintenance window. No automatic “latest minus one” rollback.
6. **Execute only after authorization:** use Cloudflare's supported Worker deployment/rollback mechanism to assign **100% traffic** to the pinned, approved candidate version. Treat the change as a production deployment, not a source-only check. Keep the live checkout kill switch and source interlock disabled.
7. **Immediately validate:** HTTPS website and `/account/`, authenticated session freshness, static asset cache compatibility, release/download feed, Pro activation/signature verification, test webhook authorization and replay behavior. Verify `/api/commerce/checkout`, `/api/commerce/webhook` and `/api/commerce/live/*` still return **503**, without using valid production payment data. Inspect Cloudflare errors and authentication anomalies; **do not log buyer PII or signing secrets**.
8. **If rollback fails:** stop traffic-changing operations, preserve evidence, and deploy a separately reviewed compatible hotfix or re-select a proven version. Do not roll back D1 by guessing or attempt a production PITR without a separate D1 recovery authorization.
9. **Close evidence:** record before/after version IDs, linked Git SHAs, timestamps, change approver, smoke results, D1 schema compatibility decision and any customer-impact remediation. Update Development Status. Only a completed and documented real deployment drill can close the corresponding operational recovery gate.

## Launch gate / ownership

- **Source-level release security checks:** implemented and passing in CI, but need to remain mandatory for Cloudflare deployment promotion.
- **Cloudflare Worker commit→version provenance:** **OPEN**, add an auditable release annotation/manifest containing the exact reviewed Git SHA and app/version identifier; avoid secrets, account details or customer identifiers. Verify that the deployed **asset bundle and Worker source** correspond to that commit.
- **Production Worker rollback rehearsal and post-switch smoke:** **OPEN / owner approval required**. No production rollback was executed during the audit.
- **Live checkout release:** **DISABLED**, and must remain so until separate explicit merchant, legal and owner approvals. No part of this runbook approves payments.

Official references: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/ and https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/


## Source-level provenance implementation — November 9, 2026

PR #152 introduces an executable commit-provenance mechanism (not a production deployment):

- `scripts/build-public-studio.sh` refuses to build without a valid **full 40-character Git HEAD SHA**, writes the full SHA into `src/deployment-provenance.js` before Worker packaging, and adds the same source SHA to the generated Studio `website/build.json`. It no longer uses a timestamp fallback that could masquerade as source identity.
- `GET /.well-known/humperdinck-deployment.json` is routed to the **Worker** ahead of static assets. The immutable bundled constant is returned as `source_git_sha`, with `provenance_verified: true` and `Cache-Control: no-store`; the `UNBUILT` placeholder fails closed with 503 and `provenance_verified: false`. No database, login, secrets or payment credentials are needed. POST/OPTIONS cannot serve it.
- `tests/worker-deployment-provenance.test.mjs` checks route priority, metadata, no-store behavior and absent static/database dependency. CI runs it.

**Operational acceptance is still OPEN:** this mechanism becomes proof for a specific Cloudflare Worker *only after* a future authorized deployment built from a verified source checkout and a read-only check of the live endpoint **paired with** the current Cloudflare version ID and deployment timestamp. Current version 305 predates this implementation; its Git SHA remains unknown. Do not use the endpoint on a newly deployed version to assert provenance for version 304/305, or claim rollback tested.

Suggested deployment evidence procedure, after independent authorization:

1. In the exact deploy checkout run `git rev-parse HEAD` and record the full SHA, workflow run and source archive identity.
2. Run `bash scripts/build-public-studio.sh` and confirm that its generated `src/deployment-provenance.js` and `website/build.json` agree with that SHA. Do not create a dirty post-build source change and claim it is a new commit; record all generated-output changes as build artifacts.
3. After Wrangler finishes, read the Cloudflare deployment and version IDs from the API, then fetch `https://humperdinck.studio/.well-known/humperdinck-deployment.json` with cache bypass. Compare its `source_git_sha` against the **actual deploy checkout** SHA, not merely latest GitHub `main`.
4. Capture the exact 100%-traffic Worker version, deploy time, SHA and endpoint response in a release record. Optionally verify `/build.json` for corresponding Studio asset revision. A mismatch blocks promotion or rollback designation.
5. Before rollback, independently validate the candidate version's embedded identity and its exact D1 schema/security compatibility. Merely observing a previously deployed version is not sufficient.

**Important limitation:** the endpoint reports the build-time source label embedded in the Worker, not a cryptographic attestation of a GitHub workflow or an immutable Cloudflare release annotation. A privileged deployer could supply modified artifacts; provenance is evidence to be cross-checked, not proof of build integrity. Existing ad hoc Wrangler deploy commands can bypass this build script; if so they expose an unbuilt sentinel and are **not provenance accepted**. A dedicated gated deploy workflow and owner acceptance are separate open work items.
