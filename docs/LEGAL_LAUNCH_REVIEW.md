# Legal pages: pre-publication review

This PR adds themed draft documents at `/privacy/`, `/terms/`, `/license/`, `/voice-policy/`, `/refunds/`, `/cookies/`, `/copyright/` and `/licenses/`. They are linked in the homepage and legal-page footers. The documents deliberately show a prominent draft warning and clearly marked placeholders instead of inventing a legal operator, contact address, commercial refund promise, or registered DMCA agent.

## Required before presenting as final legal policies

- Confirm the legal seller/operator name, country/state, address where necessary, and accessible monitored contact email or secure contact form for privacy/support/legal issues.
- Have a qualified lawyer review jurisdiction, consumer rights, liability language, licenses, voice-cloning safeguards and privacy notices.
- Audit the *deployed* homepage, public Studio, Cloudflare analytics, model CDNs, security logs and browser storage; revise policies to match observed network traffic.
- Confirmed desktop diagnostics policy: optional and disabled by default, requiring explicit opt-in; never automatically upload recordings, scripts, generated audio, or voice-project content. Required account and activation requests remain separate from telemetry.
- Before enabling diagnostic uploads, implement explicit permission and withdrawal controls, a clear preview of diagnostic fields, removal of personal data from log lines and file paths, secure transmission, narrowly scoped collection, access controls, an actual processor/vendor disclosure and fixed retention/deletion periods. Do not claim technical reports are strictly anonymous without proving it.
- Confirmed product decision: a Humperdinck account is required to purchase and initially activate Pro; once activated, local Pro remains usable offline without periodic revalidation. Implement and test this behavior before advertising it as live.
- Confirmed authentication decision: passwordless email codes or magic links, with Google and Apple sign-in; no separately maintained Humperdinck password. This is a product decision, not a claim that these login integrations already exist.
- Before accounts launch, decide precise account profile fields, email sending/authentication provider, Google and Apple OAuth configuration, account linking, recovery if a third-party login is lost, payment processor, device activation identifiers, retention/deletion policies and support procedures; update the Privacy Policy to disclose actual processing.
- Confirmed account deletion approach: remove optional account/profile information on request, retain only necessary purchase and license entitlement records, and offer reasonable verified-purchaser license recovery. Previously activated offline installations continue to function. Deletion does not automatically cancel a purchased lifetime license.
- Before account launch, specify retention periods per record type, whether a minimal contact/recovery identifier is necessary, how account deletion and verification work, who responds to requests, and how legal retention obligations and applicable deletion rights are honored.
- Verify privacy request handling, retention and security practices before enabling accounts or cloud voice uploads.
- Before payments launch: finalize the actual pricing, checkout provider, taxes, refund terms, activation/device-count rules and definition of any lifetime purchase.
- Confirmed community voice privacy: voice creations stay local/private by default. Publishing requires a separate explicit action for each selected voice plus an affirmative rights-and-consent attestation. Creators can request Humperdinck-hosted delisting and removal, but already-downloaded third-party copies cannot be guaranteed removable.
- Confirmed community license: allow lawful personal and commercial projects and distribution of generated narration; do not allow resale, sublicensing, repackaging or redistribution of the downloadable voice files themselves. This does not override source speaker consent, publicity rights or third-party model terms.
- Before accepting public community voices: define which files and metadata are uploaded (do not silently include original source recordings), review exact upload and download license acceptance, specify whether delisting stops future use of previously downloaded voice files, and finalize retention/deletion timelines, consent attestations, abuse reporting, moderation, creator takedowns, copyright removal/counter-notice procedures, and whether a registered DMCA designated agent is needed.
- Update and audit the bundled third-party notices with every desktop build and model/asset change.
- Replace the pre-launch warning and bracketed review instructions only when the policies are actually final.

## Implementation

The pages are static `index.html` files, share the homepage `styles.css` plus a small `legal.css` layer, and have no third-party scripts or forms. The footer retains the existing product links and adds all policies. No cookie banner is introduced because adding one without knowing the actual cookies/storage and jurisdictions would be misleading.

Useful official references:
- Cloudflare Web Analytics: https://developers.cloudflare.com/web-analytics/about/
- US Copyright Office DMCA agent directory: https://copyright.gov/dmca-directory/
