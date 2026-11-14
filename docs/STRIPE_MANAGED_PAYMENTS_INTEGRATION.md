# Stripe Managed Payments — Humperdinck staged integration

Status: CODE PREPARED IN TEST-ONLY STAGING; LIVE CHECKOUT DISABLED. No live transactions, signing keys, license issuer endpoints, or customer records are changed by merging.

## Scope
- Humperdinck Pro: $49.00 USD one-time, lifetime, ten devices, signed local/offline licenses.
- Stripe-hosted Checkout Sessions with mode=payment, one configured Price ID, and managed_payments[enabled]=true. No subscriptions, Connect or Stripe License Keys.
- Verify signed checkout.session.completed and checkout.session.async_payment_succeeded before recording test ledger receipts. Unpaid sessions never issue Pro.
- Verify active one-time USD 4900-cent Price, Managed-Payments-eligible software tax code.
- Leave Lemon Squeezy test data and historical purchase records intact.
- All /api/commerce/stripe/* URLs continue to respond HTTP 503 via source-level release interlock.

## Staging settings (not installed by this PR)
Configure settings/secrets privately, never paste credentials into docs, chat or GitHub:
- STRIPE_STAGING_ENABLED=true: non-routed, test-only.
- STRIPE_SECRET_KEY: sk_test_ prefixed restricted test secret; production key rejected.
- STRIPE_PRICE_ID: test-mode Price ID for the $49.00 one-time product. Live Price IDs cannot be used with test keys; create the equivalent price in test mode.
- STRIPE_WEBHOOK_SECRET: independent whsec_ prefixed test signing secret.
- STRIPE_TEST_GRANTS_ENABLED=true and STRIPE_TEST_GRANT_EMAILS: optional exact allowlist for disposable testing identities only; OFF by default.
- AUTH_DB: isolated test D1 database with migrations/0012_stripe_managed_staging.sql. Not applied to production by this PR.

## Before public release
1. Confirm Managed Payments eligibility for the actual consent-based AI voice cloning product. Eligible software tax code alone does not separately approve all features.
2. Run node --test tests/stripe-managed-staging.test.mjs tests/live-commerce-release-gate.test.mjs and perform isolated test Checkout + webhook acceptance.
3. Build separate, reviewed production routes. Checkout creation must authenticate the web account, require same-origin POST, rate limit, generate a server-side intent, and bind checkout to the exact Price.
4. Production webhook must verify the raw-body Stripe signature and livemode:true, exact $49.00 USD subtotal (tax can increase total), managed_payments.enabled, one-time paid session, unique event and owner-created intent. Never grant from success page alone.
5. Validate duplicates, late/out-of-order refund, dispute, chargeback, account deletion, checkout expiry, rate limits, retries, racing events, independent purchase records, and safe rollback. Preserve offline-license limitations.
6. Verify published price, refunds, merchant-of-record and support terms against the actual checkout, and obtain owner approval on the exact release build.
7. Only then modify the source-level LIVE_COMMERCE_CODE_APPROVED=false interlock in a separate reviewed release. Neither adding a Stripe key nor toggling a flag makes payments live.

## Files
- src/stripe-managed-staging-checkout.js: verify test Price and prepare hosted session; no public route.
- src/stripe-managed-staging-webhook.js: verify signed event and stage atomic payment/test-only allowlisted grant.
- migrations/0012_stripe_managed_staging.sql: isolated payment ledger.
- src/live-commerce-release-gate.js and wrangler.jsonc: reserve Stripe public routes as deny-by-default.
- tests/stripe-managed-staging.test.mjs: checkout, price, signature and fail-closed regressions.

Official guidance:
https://docs.stripe.com/payments/managed-payments/set-up
https://docs.stripe.com/payments/managed-payments/eligibility
https://docs.stripe.com/webhooks
https://docs.stripe.com/checkout/fulfillment
