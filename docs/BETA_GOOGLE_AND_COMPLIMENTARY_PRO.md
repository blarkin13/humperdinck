# Humperdinck — Google beta sign-in and complimentary Pro access

## Google sign-in: expand from Testing to external beta

The existing Worker is already built for standard external Google OAuth:
- Authorization Code + PKCE, nonce/CSRF/session protections; callback:
  `https://humperdinck.studio/api/account/callback/google`
- Requested Google scopes: **`openid email profile` only**.
- This is an **OAuth consent screen configuration change in Google Cloud**, NOT a requirement
  to rebuild an OAuth client, replace Google keys, or deploy a public grant endpoint.

In the project that owns the existing `GOOGLE_CLIENT_ID`:
1. Open [Google Auth Platform → Audience](https://console.cloud.google.com/auth/audience).
2. Verify User Type **External**. In Testing, beta testers can be individually
   added to the Test users list (up to Google's applicable cap).
3. For a beta not limited to named testers, select **Publish app / In production**.
   Confirm Branding, support email, `humperdinck.studio` authorized domain,
   Terms and Privacy links, and Data Access scope list first.
4. Keep exactly the existing web OAuth callback URI; **do not create a new client**
   unless required by a controlled migration.
5. Test a Google Account that is not the owner/tester, plus desktop browser pairing,
   account recovery, sign-out and a duplicate-email/identity edge case.
6. Do not request Gmail, Drive or other sensitive scopes. Expanding scopes changes
   Google verification and user consent requirements.
7. Keep actual **paid checkout disabled** while testing accounts. Google publishing
   affects who can log in, not who can become Pro.

Google's testing restrictions and exception for basic identity scopes are explained
at https://developers.google.com/identity/protocols/oauth2/production-readiness/overview .
Confirm the current configuration and any branding-verification notices in the
actual Google Cloud project; publishing is not by itself an approval of Humperdinck
or its commercial voice-cloning product.

## Give one signed-in beta tester complimentary lifetime Pro

**Owner-only**, with Cloudflare Wrangler already authenticated to the correct account
and the existing `humperdinck-accounts` remote D1 database.

The tester first signs in once at https://humperdinck.studio/account/ with Google,
so the verified account exists. In the Humperdinck repository:

```sh
# PREVIEW: reads Cloudflare D1 only, does not grant
python3 scripts/grant-complimentary-pro.py --email tester@example.com

# CREATE: requires a typed confirmation and owner Cloudflare permission
python3 scripts/grant-complimentary-pro.py --email tester@example.com --apply
```

The command:
- Matches an **existing unique** D1 account email, case-insensitively; rejects missing
  or ambiguous identities.
- Refuses to overwrite an existing paid, refunded or complimentary license record.
- Creates one `pro_licenses` row with `provider='complimentary'` and a distinct
  `purchase_ref='complimentary:<uuid>'`; maximum online device slots is 10.
- Does **not** generate invoices, receipts, fake payment events, a signed token or
  customer-facing grant APIs. The already-existing Worker signs the owner's
  certificate after their authenticated desktop activation.
- Keeps account recovery, portable encrypted/unencrypted **license certificates** and
  self-managed device slots available as implemented.

**Lifetime means lifetime:** an exported offline certificate is portable, can remain
valid without Humperdinck's online services, and cannot be remotely recalled.
For a *temporary* beta test, do NOT grant a lifetime Pro license; design an
explicit time-limited beta entitlement instead.

Security:
- The tool invokes `npx wrangler d1 execute ... --remote --json`. Never remove
  `--remote` accidentally, insert a different database, or automate without an
  owner-controlled credential.
- Do not grant a license to a person who only claims an email address in chat.
  Require that the tester can successfully log into the corresponding Google identity.
- Never expose `PRO_LICENSE_ED25519_PRIVATE` to testers or run the grant tool
  with a customer account. The grant tool needs D1 permissions; it never signs keys.
- If the tester cannot activate, confirm the account actually has a D1 user record,
  login/session connectivity and the Worker signing configuration. Do not manually
  create forged local certificates.
- Real-money sales remain blocked until the production license signing key has a
  tested owner-held encrypted backup and the payment-to-entitlement chain is approved.

## Required acceptance checklist

- [ ] New Google account signs in through website without being on test allowlist.
- [ ] Desktop sign-in opens OS browser; account pairing is explicitly approved.
- [ ] Free user cannot use personal Qwen VoiceDesign/voice cloning.
- [ ] Admin dry-run returns a matching account and makes no DB change.
- [ ] Admin confirmed complimentary grant appears once; rerun cannot replace it.
- [ ] Tester activates desktop to receive real signed portable Pro certificate.
- [ ] Tester can export/import certificate and work offline after service shutdown.
- [ ] Online 10-device cap and device reuse are tested.
- [ ] A paid license record is never confused with a complimentary grant.
