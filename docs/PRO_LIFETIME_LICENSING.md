# Humperdinck Pro: permanent offline licensing and device registration

**Status (November 2026):** Architecture and account/device features implemented. **Not commercially live.** No payment processor, checkout, verified order webhook, or public license issuance exists. A Google account alone does **not** unlock Pro. Customer voice generation and Free app features remain local.

## What is implemented

- Ed25519 asymmetric **perpetual owner certificate** issued by the Worker for a verified `pro_licenses` row.
- Signing private key is stored only as the **Cloudflare Worker secret** `PRO_LICENSE_ED25519_PRIVATE`; the matching pinned public key is embedded in `backend/pro_license.py`. Never place the private key in GitHub, desktop bundles or browser scripts.
- `migrations/0002_pro_licenses.sql`: one currently active owner license per account; purchase metadata and an online installation register.
- Account website: plan, active device count, up to **10 concurrent online registrations**, deactivation and portable backup export.
- Desktop application: random installation ID (no serial/fingerprint/hostname), activation on sign-in for a purchased account, automatic signed-entitlement detection, persistent local Pro access after sign-out or network outages, import/export of `humperdinck-pro-license.json`.
- Existing feature policy in `backend/entitlements.py` automatically reads the signed license. Free studios and built-in Qwen voices continue to work anonymously.
- Tests verify signature integrity, offline restoration, device cap, local-import rejection of altered certificates and account authorization.

## Key concept: offline ownership versus device enforcement

**Portable lifetime ownership wins.** The signed owner certificate has no expiry date and is **not bound to a computer**. It can be saved and restored even if Humperdinck stops operating. Pro uses only the embedded public key and local files to verify it. Losing connectivity or signing out never removes features already permanently licensed.

The ten-device cap is checked **when registering or reactivating an installation online**. The website lists active devices and allows deactivation. Deactivating a device releases its cloud slot but **does not remotely disable a previously exported offline license**. A user who shares their portable backup could use it on more than ten offline installations. With an unrestricted portable backup and no mandatory connectivity, **perfect ten-device enforcement is technically impossible**. Do not promise customers both guaranteed offline ownership and unbreakable global ten-device enforcement.

## Server APIs (account auth required)

| Method | Route | Description |
|---|---|---|
| GET | `/api/account/license` | User plan, active count, registered devices (no certificate). |
| GET | `/api/account/license/backup` | Portable signed Pro certificate for a verified owner. |
| POST | `/api/account/license/activate` | Desktop bearer session, random installation ID + generic label; atomically checks 10-slot cap and returns signed certificate. |
| POST | `/api/account/license/devices/:id/deactivate` | Owner browser (same-origin POST) or connected desktop bearer; releases online slot. |

There is deliberately **no client-facing purchase, upgrade, grant creation, renewal or admin issue endpoint**. The Worker reads `pro_licenses` only; normal authenticated customers cannot create grants.

## Local desktop APIs

| Method | Route | Description |
|---|---|---|
| GET | `/api/license` | Local offline certificate status. |
| POST | `/api/license/activate` | Activate an already purchased Pro license through the current connected account. |
| GET | `/api/license/export` | Export verified portable backup JSON. |
| POST | `/api/license/import` | Import a portable JSON certificate (Ed25519 verification required). |
| GET | `/api/entitlements` | Automatically report `Free` or real signed `Pro` capabilities. |

The local data directory stores `installation.json` and `pro-license.json`. They are user-scoped, private when supported, and do not contain original voice recordings. The token-like certificate is not a server session credential, but sharing it conveys offline Pro access; customers should store it securely.

## Before receiving real customer payments

1. Select Stripe/Paddle/Lemon Squeezy or another provider; design one-time lifetime ownership rather than renewal-based entitlement.
2. Add a separately authenticated **verified payment webhook** that issues `pro_licenses` records transactionally using provider order IDs (unique `purchase_ref`) and prevents duplicate or fraudulent license issuance. Purchase claims from browsers must never grant Pro.
3. Complete refund/chargeback handling and confirm the offline license policy transparently: a backup already exported cannot be revoked.
4. Implement owner account recovery/export/deletion, including license persistence. Do not accidentally destroy a lifetime purchase through routine account deletion.
5. Make a **secure disaster-recovery backup of the signing private key prior to first sale**. The key currently lives in Cloudflare's secret store; Cloudflare deliberately cannot show secret values again. If a backup cannot be established, rotate to a securely backed-up signing key and update the public key before issuing the **first** customer grant. Once grants exist, old public keys must be retained across rotations.
6. Test actual end-to-end checkout, Google login, 10-device transfer, offline restore, reinstall, signed packaged desktop builds on macOS/Windows/Linux. Finish applicable legal policies and disclosure of offline-device enforcement limits.
7. Do not label Pro as purchased until a real record exists in D1. Accounts alone are Free.

## Operations

The existing Worker is `humperdinck`, attached to D1 `humperdinck-accounts`. Migration `0002_pro_licenses.sql` must be applied to the remote D1 database **before** deploying code that reads `pro_licenses`. `PRO_LICENSE_ED25519_PRIVATE` is a Worker runtime secret, not a Cloudflare build environment variable.

To confirm that setup safely:

```bash
npx wrangler d1 execute humperdinck-accounts --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pro_%';"
```

Run tests from the project root:

```bash
node --test tests/account-auth.test.mjs tests/pro-license.test.mjs
python -m pytest -q tests/test_pro_license.py tests/test_account_client.py tests/test_api.py
npm run build --prefix frontend
```
