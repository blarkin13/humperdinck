# Private development + public binary releases

Humperdinck uses two repositories:

| Repository | Visibility | Contents |
| --- | --- | --- |
| `blarkin13/humperdinck` | Private (after migration) | Source code, build workflow, tests, issue tracking |
| `blarkin13/humperdinck-downloads` | Public | Versioned **release assets only**; optional README |

## One-time setup (repository owner)

1. Create a **public** GitHub repository named `humperdinck-downloads`, initialized with a short README. Do **not** copy any source code or development secrets into it.
2. Create a **fine-grained GitHub personal access token** with access **only** to `blarkin13/humperdinck-downloads` and **Contents: Read and write**. Store it as repository secret `RELEASES_PUBLISH_TOKEN` in the **private source** repository. Use a short expiration and rotate it on schedule; for long-term production consider a GitHub App instead.
3. In the source repository, create GitHub Actions **environment `production`**, with required reviewers/approval as allowed by the account and repository plan. Grant the release workflow permission to read the publication token. A deployment environment without configured reviewers **is not an approval gate**.
4. Keep the development repository public until Cloudflare's Worker build integration is verified against it while private. Keep existing GitHub Actions build permissions. Check that no other public site or integration fetches source files anonymously.
5. Merge the release workflow, Worker download feed and in-app updater changes into the source default branch.
6. Update `desktop/src-tauri/tauri.conf.json` to the intended release version (e.g. `0.2.0`), commit and push. The version input **must match**.
7. From the private repository's **Actions → Publish desktop installers (public distribution repo) → Run workflow**, enter the version and release notes. The build runs Windows x64, Apple Silicon macOS and Linux x64 tests/packages. After success, the `production` publication job requires approval if the environment is configured for it.
8. The publication job verifies the public repository and release version, stages **only** `.exe`, `.dmg`, `.deb` binaries and SHA256SUMS.txt, and creates GitHub Release `vX.Y.Z` in `humperdinck-downloads`. It refuses to overwrite an existing published version.
9. Verify each download in the public repository and on the destination operating system. Open the Humperdinck website `/#download`. The site's Worker reads the **latest approved public release** and fills its three download cards automatically. The website stays the customer-facing entry point; the actual bytes download from the public GitHub release.

**No source code is copied** into the distribution repository. GitHub's public release metadata is the source of truth for downloads; the website's unpublished `website/downloads.json` remains a safe fallback if public release lookup fails. The Cloudflare Worker intercepts `/downloads.json` and `/updates/latest.json`; no R2 bucket is needed for this distribution arrangement. The previous R2 instructions in `website/README.md` are an alternative, **not** a prerequisite for this workflow.

### Ordinary development vs. publishing

- Every normal push: updates the private source repository only.
- Open PRs: run tests, never publish a release.
- Explicit `Publish desktop installers` workflow: rebuilds from the selected main revision, waits for test success and configured environment approval, then uploads binaries to the public repository.
- Customers: open the website, click a platform button; they never need permissions on the source repository.
- Installed unsigned preview apps: check the first-party website manifest for a newer manual installer.
- Signed production apps (future): check the first-party `/updates/latest.json` updater feed, download signed platform artifacts from the **public distribution repository**, verify their Tauri signature and install with approval.

## Signed updater publishing is a distinct release gate

The current release workflow produces **unsigned preview installers**. It does not yet produce signed Tauri updater artifacts. Do not claim in-app automatic installation is live merely because `vX.Y.Z` installers appear on the website.

To enable automatic installation, first create and securely retain Tauri's updater signing key (never commit the private key), embed its **public key** at desktop build time via `HUMPERDINCK_UPDATER_PUBKEY`, build with `bundle.createUpdaterArtifacts: true` and `TAURI_SIGNING_PRIVATE_KEY` set, and publish the exact updater bundles plus `latest.json` with their **real detached signatures** as additional assets on the same public release. The first-party Worker exposes the manifest at `/updates/latest.json`. Tauri verifies the signature before replacing the application. For Linux's native updater choose an AppImage edition; the `.deb` edition remains manual unless a distro package update mechanism is implemented. macOS notarization and Windows code signing are recommended before broad public distribution.

### Security and rollout

- Do not make the source repository private until Cloudflare builds from private GitHub are working.
- Do not publish secrets or an installation token to the public repo. The only public content is the release binaries, checksums and approved release notes.
- Never automatically publish from every push to `main`. A released version should pass tests and receive explicit approval.
- First install and updater binaries are large; avoid GitHub Actions **artifacts** as customer downloads because they expire. Use persistent GitHub **Releases**.
- Releases in the public repository remain accessible after the development repository becomes private.
