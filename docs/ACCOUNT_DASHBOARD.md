# Humperdinck account dashboard (Step 4)

The customer-facing dashboard lives at https://humperdinck.studio/account/ and uses the existing main website header and footer. It is optional; Humperdinck Free remains available without accounts or cloud service access.

## Sections

**Purchase** — displays the actual D1 `pro_licenses` status: no purchase / active lifetime Pro / refunded / void, plus issue date, payment provider and order reference **only when recorded**. It never invents receipts or pricing and never grants Pro from browser actions. The checkout provider is still undecided; `receipt_available: false` and `checkout_available: false` remain true until commerce is integrated.

**Computers** — two distinct inventories:
- Connected desktop sessions are online account bearer-token sessions. They register a generated random UUID and a generic OS+random-suffix label when the desktop app completes browser pairing; no hardware serial, fingerprint or hostname is collected. The owner can remotely revoke individual registered sessions or **all** desktop sessions, including sessions from older app versions not individually identified.
- Pro activations are the up-to-ten online license slots in `pro_devices`. A slot can be deactivated through the account dashboard. This is separate from signing out an online session. An existing signed offline license cannot be revoked by either action.

**Downloads** — verified lifetime Pro owners can download `humperdinck-pro-license.json`, a portable Ed25519-signed license that can be restored in desktop My Account without an internet connection. Free users are told that no license file is needed. No original voice recordings are included.

**Recovery** — customers may create an explicit one-time recovery kit with an account ID and **eight distinct 192-bit codes**. Only a keyed SHA-256 digest is stored in D1; raw codes are returned *once* over the authenticated HTTPS response and retained only in the current browser memory until closed. Creating a new kit revokes all old unused codes atomically; each code is consumed at most once. A code plus account ID opens a new 30-day website session. Rate limits and same-origin JSON POST restrictions apply. After recovering, the user can link an additional Google or (when configured) Apple identity from within the authenticated dashboard; the OAuth link flow confirms the original session, validates OIDC state/signature/nonce, and refuses identities already belonging to another user.

A **recovery kit is a sensitive sign-in credential**. Anyone with the account ID and an unused code can sign in. Customers must store it securely, separate from shared projects. The signed offline *Pro license* is **not an account login credential**. Without any linked identity or saved recovery code, automated account recovery is not available.

## Cloudflare setup

The Worker is `humperdinck`, with D1 binding `AUTH_DB` pointed to `humperdinck-accounts`. Apply `migrations/0003_account_dashboard.sql` **before** deploying the updated Worker. The tables are additive and `CREATE TABLE/INDEX IF NOT EXISTS`; no existing account sessions or purchases are overwritten.

| API | Method | Purpose |
|---|---|---|
| `/api/account/dashboard` | GET | Authenticated customer purchase, provider, connection and recovery metadata |
| `/api/account/dashboard/connections/register` | POST | Desktop-bearer-only anonymous installation registration |
| `/api/account/dashboard/connections/:id/revoke` | POST | Website session revokes one connected desktop token |
| `/api/account/dashboard/connections/revoke-all` | POST | Website session revokes all desktop tokens, including old unregistered ones |
| `/api/account/dashboard/recovery/codes` | POST | Website session generates eight codes and invalidates the previous set |
| `/api/account/recovery/redeem` | POST | Public recovery-code sign-in, one-time verified and rate-limited |
| `/api/account/link/start/google` | GET | Authenticated owner links another Google identity via OIDC |
| `/api/account/link/start/apple` | GET | Same for Apple when Apple OAuth is configured |
| `/api/account/license` | GET | Already-existing Pro license status and registered activation slots |
| `/api/account/license/backup` | GET | Already-existing permanent signed Pro license export |

### Development tests

```bash
node --test tests/account-auth.test.mjs tests/account-dashboard.test.mjs tests/pro-license.test.mjs
node --check website/account/account.js
python -m pytest -q tests/test_account_client.py tests/test_pro_license.py
```

Run the frontend build to verify the website public studio remains functional. Tests use fake account records and keys only, never production customer data.

## Boundaries and next steps

- Google sign-in is live. Apple sign-in remains disabled until configured.
- No commerce provider, paid checkout, invoices, refunds integration or verified-payment webhook exists yet. Payment provider names/order IDs are displayed only from actual D1 records; do not fabricate a purchase.
- Session revocation is **online access revocation**, not an offline DRM lock; lifetime certificates remain valid.
- Preserve lifetime purchases and backups if implementing account deletion or support-based recovery. Choose a support contact and verified proof-of-purchase process before opening checkout. Without a recovery kit or linked identity, no automated recovery pathway exists.
- Back up the private license signing key securely before the first Pro sale. Changing the key requires retaining support for older public keys so customer certificates remain valid forever.
