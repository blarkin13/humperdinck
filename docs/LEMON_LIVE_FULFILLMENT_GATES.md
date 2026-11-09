# Lemon Squeezy production one-time Pro — fail-closed launch gates

**Status: production planning and verification code only, NOT live checkout.**
The live Worker route is absent, `LS_LIVE_*` secrets are not installed by
these changes, and the sandbox cannot grant commercial Pro. Existing
`src/lemon-test-commerce.js` stays isolated.

## Verified upstream behavior

Lemon Squeezy signs webhook bodies with `X-Signature` using the configured
webhook secret and sends `X-Event-Name`; `order_created` and
`order_refunded` are separate events. Checkout custom data appears under
`meta.custom_data`. The Order object contains `test_mode`, store, and
first order item/variant fields. Official references:

- https://docs.lemonsqueezy.com/help/webhooks/webhook-requests
- https://docs.lemonsqueezy.com/help/webhooks/event-types
- https://docs.lemonsqueezy.com/help/checkout/passing-custom-data
- https://docs.lemonsqueezy.com/api/orders/the-order-object

The source has a **non-routed** production message validator
`src/lemon-live-preflight.js`, a conservative decision planner
`src/lemon-live-fulfillment-plan.js`, and an atomic settlement primitive
`src/lemon-live-settlement.js` with unapplied `0006_lemon_live_ledger.sql`.
None is wired to a live HTTP endpoint; live migration, merchant approval,
real-payment credentials, refund policy and operator launch gating remain pending.

## Explicit production HTTP release interlock (source-only)

The Worker reserves `/api/commerce/live/*`, `/api/commerce/production/*`,
`/api/commerce/checkout` and `/api/commerce/webhook` and currently
**always responds with HTTP 503, no-store** for each route. These paths are
listed in `wrangler.jsonc` `assets.run_worker_first` so they cannot be
silently served by static assets or a stale SPA fallback.

`src/live-commerce-release-gate.js` declares
`LIVE_COMMERCE_CODE_APPROVED=false`; unlike a Cloudflare variable, it
cannot be changed by adding secrets, editing a checkout flag, or applying
a D1 migration. The Worker does **not** import or invoke any live payment,
issuance or refund module. The negative test suite
`tests/live-commerce-release-gate.test.mjs` exercises GET/POST/OPTIONS and
other methods under production-looking credentials and flags, verifies
there are no database or asset calls, and checks routing configuration.

**Turning on production commerce requires a new explicitly reviewed
source-code change**, not a configuration-only switch. That change must:
1. Verify merchant and product approval, purchase/refund policy, payment
   credentials, and actual live D1 migration and rollback plan.
2. Introduce authenticated checkout and signed, replay-safe webhook handlers
   with tests for account, order, price, refund, expiry and failure cases.
3. Include a separately controlled runtime kill switch (OFF by default)
   for checkout and entitlement issuance; document the rollback route.
4. Pass an explicit launch review and staged acceptance tests, then
   intentionally change both this code interlock and the deployment route.
5. Keep this deny-route regression test failing until the new policy and
   matching tests are rewritten deliberately. No test should silently
   start accepting a live payment based only on environment variables.

This guard is source-level assurance. It does not substitute for production
Cloudflare deployment verification, provider approval or an independent
penetration test.

## November 9 — staged webhook and refund operations adapters

`src/lemon-live-webhook-adapter.js` adds a **non-routed** integration seam:
raw-body HMAC and exact event/store/variant inspection run before calling
the existing atomic paid/refund functions. It requires both
`LS_LIVE_STAGING_PROCESSOR_ENABLED === true` and
`LS_LIVE_SETTLEMENT_ENABLED === true`, plus a separate trusted caller's
`operatorReleaseApproved: true`. Setting these values alone does not
open an HTTP endpoint: the public Worker still returns 503 to every live
commerce route. This is an internal staging adapter, **not a live checkout
API or completed merchant acceptance**.

`src/lemon-live-operator-summary.js` gives authorized operators aggregate
paid/refunded/partially-refunded/disputed and webhook receipt counts,
without purchaser PII, only under an additional default-off review flag.
It does not initiate refunds, make policy decisions, poll merchant disputes,
or revoke a perpetual license. Missing ledger tables return unavailable.

Synthetic tests in CI cover both modules. Real Lemon Squeezy checkout API
creation, actual merchant webhooks, policy reconciliation, credentials and
explicit final launch activation remain separately blocked.

## Required sequence before payment issuance is activated

1. Merchant of record formally approves Humperdinck; operator creates
   a production one-time product/variant, sets final public price and checks
   customer-facing refund, invoice and tax representation.
2. Create a distinct *live* webhook secret and production API credentials;
   protect them as Cloudflare secrets. Keep test and live identifiers in
   separate namespaces. No secrets in GitHub, Google Docs or chats.
3. Implement authenticated checkout-intent creation with a cryptographic
   random intent ID, bound to the signed-in account and a known variant.
   Record intent, expiry, price/currency and mode in D1 before redirecting.
4. Validate raw-body HMAC in constant-time WebCrypto, exact production
   store, variant, event/header, paid status, `test_mode:false`, account and
   intent identifiers. An account ID alone in a webhook is insufficient;
   match the intent and buyer, and verify the order's purchased item.
5. In one atomic D1 transaction, preserve event idempotency by provider
   order ID and signed-body hash, persist minimal paid order evidence, and
   issue **at most one** lifetime Pro entitlement per account. Never
   overwrite an unrelated complimentary license or another purchaser's
   purchase reference. Handle multiple valid purchases for one account
   by reconciliation rather than losing either transaction.
6. Return HTTP 200 only for durably handled, verified events; failures should
   remain retryable. Record failures without raw PII payloads or signatures.
7. Treat partial refunds, full refunds and chargebacks as distinct cases.
   Define policy with legal/merchant review. A downloaded *perpetual offline
   certificate cannot be remotely invalidated*, and refunding an order must
   not silently delete the customer's independent existing entitlements.
8. Validate fresh paid account, duplicate webhooks, refund-before-paid,
   replay, crash halfway through transaction, 8/10/11 devices, recovery
   after lost account provider and real end-to-end transaction in test mode.
9. Only after results and operator approval, add production route and set
   an explicit default-off launch flag. Production issuance and downloadable
   releases remain separate approvals.

## Synthetic end-to-end payment acceptance — November 9, 2026

PR #143 adds `tests/lemon-live-acceptance.test.mjs` and includes it in
frontend CI. The suite uses **in-memory SQLite** with the real staged schema,
a synthetic signed Lemon Squeezy-shaped webhook body, and the isolated
production-plan functions. Frontend and Python CI passed.

It covers a signed-in checkout intent, HMAC-validated paid order, atomic Pro
issuance, duplicate replay, partial timing safeguards, refund-after-paid,
refund-before-paid, delayed webhook versus order time, cross-account/order
forgery, existing-license preservation, simulated D1 transaction rollback
and retry, merchant-verified dispute evidence, and the public HTTP gate
remaining at 503 even with live-looking credentials.

**This is simulated acceptance, NOT a merchant-provider checkout.** No real
Lemon Squeezy checkout was created, no external provider API was called,
and no production Cloudflare D1 database was modified or migrated. Physical
merchant sandbox acceptance (including successful refund and receipt
reconciliation), operating-system license activation, final refund policy,
merchant approval, signer/key-recovery proof, and final launch sign-off remain
open. Do not enable live checkout or paid license issuance based on this
test result alone.

## Current test coverage and limitations

`tests/lemon-test-commerce.test.mjs` verifies sandbox HMAC, store/variant
isolation and duplicate/refund event behavior without granting Pro.
`tests/lemon-live-preflight.test.mjs` verifies signed production events
while rejecting test-mode contamination.
`tests/lemon-live-fulfillment-plan.test.mjs` covers replay/refunds,
conflicting existing certificates and bad account-intent bindings.
`tests/lemon-live-settlement.test.mjs` executes the staged ledger and
settlement SQL against in-memory SQLite, including duplicate paid events,
exact price/store/variant matching, webhook hash collision and rollback
of a simulated mid-transaction failure. It runs in frontend CI.
`src/lemon-live-refund.js` is a non-routed, non-revoking refund reconciler.
`tests/lemon-live-refund.test.mjs` covers duplicate refunds, refund-before-paid,
partial/full ordering, account/order mismatches and rollback. Full refund
status cannot be downgraded by a delayed partial refund. These tests pass
in CI (PR #136); no customer entitlement is revoked automatically.

The non-routed settlement primitive also reconciles a valid additional
purchase by an account with an existing active Pro grant. The new purchase
is retained in the live order and event ledger while the original license,
provider, purchase reference and device registrations remain untouched.
The active license is rechecked atomically before settlement. Tests for
replays, mismatch, concurrent deactivation and rollback passed in PR #140.
Refund handling, merchant approval, final policy and actual live endpoint
activation remain independent release gates.
`src/lemon-live-disputes.js` and `migrations/0007_live_disputes.sql` add a
non-routed, unapplied operator-reviewed dispute case ledger. As of Nov 9,
2026, Lemon Squeezy documents no dedicated chargeback webhook; provider
dashboard/support evidence must be verified by an authorized operator.
`tests/lemon-live-disputes.test.mjs` covers case replay, stale/terminal
transitions, cross-order conflicts and rollback; CI passed in PR #137.
This code records case evidence, but does not independently verify the
merchant evidence, automate merchant dispute polling or revoke Pro access.

Checkout intent event-time expiry, refund and chargeback policy,
merchant-account verification and production routes remain gated.

**None** of these tests proves merchant approval, live checkout,
production D1 migration and routing, refund treatment
or sales tax compliance. Public purchase controls remain disabled.
