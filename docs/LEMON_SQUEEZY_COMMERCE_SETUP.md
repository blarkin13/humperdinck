# Humperdinck: Lemon Squeezy prelaunch & test-mode checklist

Status: prepared, **not live**. Humperdinck is operated by Brian Larkin, sole proprietor, Texas, USA.

## Public contact information — configured in Cloudflare

- Product website: https://humperdinck.studio
- Customer support: support@humperdinck.studio
- Billing / refunds: billing@humperdinck.studio
- Privacy: privacy@humperdinck.studio
- Legal / voice-rights: legal@humperdinck.studio

All four aliases forward to the owner's personally verified Gmail destination through
Cloudflare Email Routing. Keep the private destination off the public website and
outside GitHub. **Email forwarding is incoming only**: do not assume customers see
a branded From address on replies. Configure a supported outbound email service
or reply from Gmail with appropriate disclosure until that is done. Send a real
email from an unrelated address to each alias and verify successful receipt.

Legal pages now identify Brian Larkin and the public aliases. Prelaunch legal terms
still require the final price, merchant-of-record terms, processing/refund procedure,
retention schedule, and legal review. Do not claim that DMCA-agent registration,
product-age verification, or payment-provider approval is complete.

## Commercial decisions to make

1. Obtain Lemon Squeezy's **written** eligibility decision on local AI voice design,
   consent-based personal voice cloning only. No user-submitted community cloned-voice downloads are planned.
2. Choose lifetime Pro price and clarify what is included; avoid claims of
   unspecified hosted features being permanent. No subscription or recurring bill.
3. Verify legal entity status, tax and payout credentials directly with Lemon Squeezy;
   never store SSNs, bank data or tax IDs in code or chats.
4. Finalize refund rights and policies consistent with merchant-of-record rules and
   mandatory local consumer protections. Current no-voluntary-refunds wording is a
   proposal, not legal advice.
5. Review the signed-consent, indemnification and no-liability provisions with a
   qualified attorney familiar with software, AI-generated voice, rights of publicity,
   and interstate/international consumer sales. **Contractual indemnity does not
   provide blanket immunity from third-party claims or regulatory action.**
6. Test code-signed Windows, notarized macOS and supported Linux installers.

## What the code currently supports

`src/lemon-test-commerce.js` offers a **disabled-by-default test-only**
Lemon Squeezy API integration and webhook listener. No public upgrade, production
checkout or license-issuance endpoint has been added.

- `POST /api/commerce/test/checkout`: current signed-in web account creates a
  short-lived test checkout intent. Strictly forces `test_mode: true` and only the
  configured variant; returns a checkout URL on `*.lemonsqueezy.com`.
- `POST /api/commerce/test/webhook`: verifies the original request body against
  the configured HMAC SHA-256 signing secret and validates the order's test-mode
  flag, store, variant, event name, account and checkout intent.
- `GET /api/commerce/test/status`: authenticated list of recent sandbox intents.
- Data is isolated in `commerce_test_intents`, `commerce_test_orders` and
  `commerce_test_webhook_events` from `migrations/0004_lemon_squeezy_test.sql`.
- **Absolutely no test event changes `pro_licenses` or grants real Pro.**
- All three routes return HTTP 503 until the complete test configuration is set.
- The dashboard does not expose a test checkout button to customers. Production
  checkout remains disabled.

## To activate test mode AFTER a Lemon Squeezy store exists

In Lemon Squeezy's test environment:

1. Create a **single-payment**, downloadable-software product with its own
   one-time lifetime Pro variant. Do not enable Lemon Squeezy's separate license
   key system: Humperdinck uses signed offline certificates.
2. Create a test-mode API key and record **store ID** and **variant ID**.
3. Create a test webhook for `order_created` and `order_refunded` pointing to
   `https://humperdinck.studio/api/commerce/test/webhook`. Set and securely copy a
   dedicated random webhook signing secret.
4. Store the following only as Cloudflare Worker **secrets** (not build variables,
   website markup, source control or desktop app):
   - `LS_TEST_API_KEY`
   - `LS_TEST_WEBHOOK_SECRET`
   - `LS_TEST_STORE_ID`
   - `LS_TEST_VARIANT_ID`
5. Apply `migrations/0004_lemon_squeezy_test.sql` to Cloudflare D1 (`AUTH_DB`)
   **before** enabling the test configuration or merging a Worker route using it.
6. Test only with an approved internal account. The account page does **not**
   contain a checkout link; test actions are available through same-origin
   authenticated API requests. Never paste credentials or confidential checkout
   URLs into bug reports.
7. Verify the following in test mode: paid order accepted; invalid signature
   rejected; mismatched store/variant rejected; non-test orders rejected; duplicate
   events idempotent; refunds recorded; incorrect account IDs rejected; no Pro grant
   issued. When the provider account is approved, develop a separate reviewed
   production issuance path and payment-account reconciliation.

**Provider-sensitive behavior:** the raw webhook request body and exact
`X-Signature` header are required for HMAC verification. The webhook metadata
must include `custom_data.account_id` and `custom_data.intent_id` created
server-side, not user supplied. No receipt or checkout should be considered paid
based on a browser redirect.

## Lifetime signing-key disaster recovery: NOT YET COMPLETE

The live `PRO_LICENSE_ED25519_PRIVATE` Cloudflare secret was generated inside
Cloudflare. It cannot be exported through the Cloudflare secret-reading API.
**Do not replace it abruptly.** Existing complimentary offline certificates
must remain verifiable after key changes.

The repository includes a local script to generate a **new v2** Ed25519
signing key and an AES-256-GCM + scrypt encrypted private-key backup:

```bash
python3 -m pip install cryptography
python3 scripts/create-pro-license-signing-backup.py \
  --output ~/Documents/humperdinck-pro-signing-v2.encrypted.json
```

Run it **on a trusted local computer**. Select a strong password (20+ chars)
and keep the password separate from the encrypted backup file. Store a second
encrypted backup in secure offline storage. Never attach it to a ticket, commit
it, email it or upload it into ChatGPT.

The script **does not deploy v2**. A separate reviewed migration must:
- Add a versioned Ed25519 public-key ring in desktop verification, including
  the current public v1 key *forever* for preexisting lifetime licenses.
- Configure the Worker to sign new certificates with the backed-up v2 private
  key; preserve v1 verification throughout the transition.
- Test restore with both v1 and v2 grants on Windows, macOS and Linux.
- Only after that, make v2 active for newly issued purchases.

Until the key backup and rotation are completed and verified, **do not accept
money for a lifetime Pro license**.

## Final prelaunch gate

No payment acceptance until provider approval, one-time pricing, terms and refund
review, permanent-key recovery, checkout and refund webhook validation, true
purchase-to-account issuance, 10-device registration and offline reinstall tests
are all complete. Automated and test-mode results are not a substitute for
end-to-end validation on signed installer artifacts.

## Owner QA: test purchases that grant Pro (allowlist only)

Test orders still never grant Pro, except for accounts listed in the
`LS_TEST_GRANT_EMAILS` Worker secret (comma-separated emails, default empty).
For those accounts a paid test order inserts one `pro_licenses` row with
`provider='lemonsqueezy-test'` and `purchase_ref='lstest:<order id>'`:

- an existing license on the account (complimentary or earlier) is kept as is;
- a full test refund marks only that test license `refunded` (exported
  offline backups stay valid, as with any lifetime license);
- partial refunds change nothing, and a paid event after a refund never regrants.

Use a second Google account that has no Pro yet, so the grant is visible.

1. In Lemon Squeezy (Test mode on): create the product/variant, an API key and
   a webhook to `https://humperdinck.studio/api/commerce/test/webhook` with
   events `order_created` and `order_refunded`.
2. `npx wrangler secret put` each of `LS_TEST_API_KEY`, `LS_TEST_WEBHOOK_SECRET`,
   `LS_TEST_STORE_ID`, `LS_TEST_VARIANT_ID`, `LS_TEST_GRANT_EMAILS`.
3. Sign in at /account/ with the allowlisted account, press **Buy Pro (test
   mode)**, pay with a Lemon Squeezy test card. The dashboard polls until Pro
   shows, then in the desktop app choose **Activate an existing Pro purchase**.
4. To clean up later: `UPDATE pro_licenses SET status='void' WHERE provider='lemonsqueezy-test'`.
