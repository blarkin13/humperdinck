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

This settlement primitive currently serves **new accounts without an
existing Pro grant**. Additional purchases by existing Pro customers
require a separate reviewed reconciliation path, not silent overwrite.
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
