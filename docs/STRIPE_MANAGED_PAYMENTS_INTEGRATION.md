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


## Production adapter prepared (not routed)
The separate source module src/stripe-managed-live-prelaunch.js now prepares a Stripe LIVE one-time $49.00 Checkout Session and atomically records a verified paid webhook alongside the existing Humperdinck Pro entitlement. This remains unrouted and cannot take payments merely by adding secrets.

Required future live settings (do not publish any secret values):
- STRIPE_LIVE_STAGING_ENABLED=true, private trusted internal usage only; this is not a public release switch.
- STRIPE_LIVE_SECRET_KEY: sk_live_ restricted secret.
- STRIPE_LIVE_PRICE_ID: Price ID for the owner-selected $49.00 one-time USD product.
- STRIPE_LIVE_PRODUCT_ID: exact corresponding Stripe Product ID, validated independently from the Price.
- STRIPE_LIVE_WEBHOOK_SECRET: whsec_ for the chosen live webhook destination, distinct from test.
- AUTH_DB with migrations/0013_stripe_managed_live_ledger.sql, only after controlled migration and rollback acceptance.

The live adapter has no public route in model-proxy-worker.js and is still blocked by src/live-commerce-release-gate.js. Before any production route:
- Implement same-origin web-account POST + throttle around Checkout creation, signed webhook listener using the untouched raw body, and a public account-only purchase-status view that never relies solely on redirect.
- Validate live Stripe API calls and webhook behavior with an isolated environment; CI synthetic tests do not prove real Stripe API acceptance.
- Handle signed refunds, chargebacks and disputes, preserve required purchase/tax evidence, and reconcile previously downloaded offline licenses without automatic remote revocation promises.
- Require the owner to explicitly approve changing release interlock, deploying credentials and exposing Buy Pro. Do not auto-trigger this from code merges.

## Verified live Stripe catalog (Nov 13, 2026)

The connected Humperdinck Stripe account has one active live Product and Price. These identifiers are public configuration IDs, **not API keys**:

- Stripe account ID: acct_1UbWjTIYFiMNwrqM
- Live product ID: prod_Vcme5juVwAfx2O
- Live price ID: price_1UbX50IYFiMNwrqMadakKynb
- Product: Humperdinck Pro — Lifetime License
- Price: USD 4,900 cents ($49.00), one-time (`recurring=null`), active, live
- Product tax category: txcd_10202000 (downloadable software for personal use)
- Price tax_behavior is `unspecified`; check Managed Payments' treatment in an actual test checkout, not assumed to prove a tax configuration defect.
- Account-wide Managed Payments is marked Ready to use by the owner, but no successful Managed Payments transaction has been verified.

Configure `STRIPE_LIVE_PRICE_ID` and `STRIPE_LIVE_PRODUCT_ID` with the above verified IDs when preparing the **disabled** production integration. Do not insert API keys in the repository; prefer separate minimally scoped restricted `rk_live_`/`rk_test_` keys in Cloudflare secrets. The source supports either restricted or standard secret keys and uses Stripe API version 2026-09-30.endive. The connected Stripe plugin currently exposes **live mode only**; a separate sandbox/test mode account must be connected before using it for test transactions. No checkout sessions or charges were created during catalog verification.
