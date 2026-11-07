# Legal pages: pre-publication review

This PR adds themed draft documents at `/privacy/`, `/terms/`, `/license/`, `/voice-policy/`, `/refunds/`, `/cookies/`, `/copyright/` and `/licenses/`. They are linked in the homepage and legal-page footers. The documents deliberately show a prominent draft warning and clearly marked placeholders instead of inventing a legal operator, contact address, commercial refund promise, or registered DMCA agent.

## Required before presenting as final legal policies

- Confirm the legal seller/operator name, country/state, address where necessary, and accessible monitored contact email or secure contact form for privacy/support/legal issues.
- Have a qualified lawyer review jurisdiction, consumer rights, liability language, licenses, voice-cloning safeguards and privacy notices.
- Audit the *deployed* homepage, public Studio, Cloudflare analytics, model CDNs, security logs and browser storage; revise policies to match observed network traffic.
- Verify privacy request handling, retention and security practices before enabling accounts or cloud voice uploads.
- Before payments launch: finalize the actual pricing, checkout provider, taxes, refund terms, activation/device-count rules and definition of any lifetime purchase.
- Before accepting public community voices: deploy consent attestations, abuse reporting, moderation, copyright removal/counter-notice procedures, and determine whether a registered DMCA designated agent is needed.
- Update and audit the bundled third-party notices with every desktop build and model/asset change.
- Replace the pre-launch warning and bracketed review instructions only when the policies are actually final.

## Implementation

The pages are static `index.html` files, share the homepage `styles.css` plus a small `legal.css` layer, and have no third-party scripts or forms. The footer retains the existing product links and adds all policies. No cookie banner is introduced because adding one without knowing the actual cookies/storage and jurisdictions would be misleading.

Useful official references:
- Cloudflare Web Analytics: https://developers.cloudflare.com/web-analytics/about/
- US Copyright Office DMCA agent directory: https://copyright.gov/dmca-directory/
