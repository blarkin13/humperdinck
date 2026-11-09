# Pro lifetime signing-key backup and recovery — operator runbook

**Status:** Owner-generated v2 encrypted backup has been locally decrypted and verified, and its public key is pinned. **Cloudflare v2 private-key staging, dual-version packaged-client test, separate offline backup copy, and production activation remain PENDING.** The existing Cloudflare `PRO_LICENSE_ED25519_PRIVATE`
v1 value cannot be retrieved through its secret-reading API. Do not delete or
overwrite it. The current public v1 verifier must continue working indefinitely
for already-issued complimentary/offline certificates.

## Implementation checkpoint — November 8, 2026

The repository now includes version-aware offline verification in
`backend/pro_license.py` and version-selectable issuance in
`src/pro-license.js`. **Both remain v1 for issuance by default.** The v1 and v2 public verification keys are pinned in the desktop verifier. Attempting to activate v2
without the corresponding private signing secret still returns HTTP 503.
Automated tests verify that v1 certificates remain usable, a synthetic v2
grant becomes valid only when its public key is pinned, unrecognized key IDs
fail, and an unset v2 configuration cannot mint a certificate or register a
device. Existing signing secret values are NOT modified by these commits.

**Owner-provided public key pinned:** `humperdinck-pro-ed25519-v2`;
`LJ0GvDnAUCXlSGtJrAYs8L6yFZvAbcpuvLNBQHNH4MM=`. Verify the encrypted v2 backup locally and store a separate
protected copy. **NEVER** send the JSON backup, raw private key, encryption
passphrase, vault credentials, or `wrangler secret` command stdin. Release
the updated desktop verifiers first; only then
deploy the owner-held v2 private key and change
`PRO_LICENSE_ACTIVE_KEY_ID` to `humperdinck-pro-ed25519-v2` through a
separately reviewed Cloudflare release. A v2 key deployed without client
support would strand newly issued Pro licenses on older installers.

## 0. Block real-money sales until a recoverable signing key is active

- Do not allow live purchases or customer issuance without an operator-controlled
  recoverable signing key and successful restore exercise.
- Current v1 certificates, including complimentary grants, must continue verifying
  even after new certificates use v2.
- Never place an Ed25519 private key, key backup, passphrase, recovery code, or
  cloud API token in GitHub, ChatGPT, Google Docs, email or a support ticket.
- Keep the existing verified v1 public key in every future desktop release.

## 1. Generate v2 on an owner's trusted machine

Install Python 3.11+ and the cryptography package **in an isolated venv**.
From the repository root:

```sh
python3 -m venv .venv-signing
.venv-signing/bin/python -m pip install cryptography
.venv-signing/bin/python scripts/create-pro-license-signing-backup.py \
  --output ~/Documents/humperdinck-pro-signing-v2.encrypted.json
```

On Windows, use `.venv-signing\\Scripts\\python.exe` instead.
The script prompts interactively for a 20+ character passphrase, encrypts
the new v2 private key with AES-256-GCM and scrypt, writes an owner-only local
backup file, and prints **only its public key**.

`PRO_LICENSE_ED25519_PRIVATE` **v1 remains untouched** at this point.

## 2. Prove the backup is recoverable before deployment

```sh
.venv-signing/bin/python scripts/verify-pro-license-signing-backup.py \
  --input ~/Documents/humperdinck-pro-signing-v2.encrypted.json \\
  --expected-public-key 'LJ0GvDnAUCXlSGtJrAYs8L6yFZvAbcpuvLNBQHNH4MM='
```

- The output must explicitly report `Pinned deployed public key matched: True`. A merely self-consistent backup from the wrong signer must fail. The command never displays the private key or passphrase.
- Repeat recovery on a second trusted machine or secure offline environment,
  using a separately held copy, so you do not merely verify the same disk.
- Compare the safely printed public key and key ID to the original generation.
- Test a deliberately incorrect passphrase **against a copy**, not the only backup.
- Keep **two encrypted backup copies** on separate offline media, plus the
  passphrase in a separately controlled password vault; test access by your
  designated recovery operator.
- Record only completion dates, verifier output status, key ID, safe public key
  and storage custodian; never record the private key or its passphrase.

Automated CI in `tests/test_signing_key_backup.py` simulates recovery from two independently stored copies, rejects a mismatched pinned public key, rejects a bad passphrase, and verifies the intact copy after corrupting the second. **This is not evidence that the owner's actual v2 backup has been replicated or restored on separate hardware.**

## 2A. Safely stage private v2 signer in Cloudflare (owner's Mac only)

**Prerequisites:** owner has verified the backup using the passphrase, created a
second offline encrypted backup copy, and knows that the latest Windows,
macOS and Linux *packaged* clients all verify pinned v2 licenses offline.
Do not take this step just because a source-code test passes.

Your existing local checkout contains unmerged modifications. Fetch only the
staging script without resetting, deleting, or merging local changes:

```sh
cd ~/Projects/humperdinck
git fetch origin main
git show origin/main:scripts/stage-pro-v2-signing-key.py > "$HOME/.humperdinck-secure/stage-pro-v2-signing-key.py"
chmod 600 "$HOME/.humperdinck-secure/stage-pro-v2-signing-key.py"

.venv-signing/bin/python "$HOME/.humperdinck-secure/stage-pro-v2-signing-key.py" \\
  --backup "$HOME/.humperdinck-secure/pro-v2.encrypted.json" \\
  --worker humperdinck
```

The script verifies the decrypted Ed25519 key matches the **exact** pinned
public v2 key. It asks for owner confirmation and a passphrase in the terminal.
It streams base64 PKCS8 directly via stdin to Wrangler `secret put`,
without writing an unencrypted copy or printing the secret. It intentionally
**does not** write `PRO_LICENSE_ACTIVE_KEY_ID`, replace v1, issue licenses or
enable checkout. Run only from the project directory with the intended
Cloudflare Wrangler login.

Once complete, check Cloudflare Workers secrets **names only**:
`PRO_LICENSE_ED25519_PRIVATE` (v1) must still exist and
`PRO_LICENSE_V2_ED25519_PRIVATE` (staged v2) must now appear.
A secret's name being present does not by itself prove that its value works;
the Worker checks the v2 private/public key pairing at issuance.

## 2B. Activate v2 only after all three packaged-client tests are completed

This is a *separate* operator-approved change. Keep v1 material and verifier
for permanent offline customer compatibility. After staging, using Wrangler
logged in to the correct account:

```sh
cd ~/Projects/humperdinck
printf '%s' 'humperdinck-pro-ed25519-v2' | npx wrangler secret put PRO_LICENSE_ACTIVE_KEY_ID --name humperdinck
```

Then use an **existing owner-controlled complimentary test account** to request
a fresh v2 license (the response must have
`key_id=humperdinck-pro-ed25519-v2` and a verified Ed25519 signature), test
online activation and offline import on all current packaged installers. The
published v2 verifier does **not** require internet once a valid certificate
is installed. Don't switch without real packaged tests.

**Rollback for new issuance only:** If new v2 signing fails, restore the
selector to v1 (do NOT delete v2, v1, or previously issued certificates):

```sh
printf '%s' 'humperdinck-pro-ed25519-v1' | npx wrangler secret put PRO_LICENSE_ACTIVE_KEY_ID --name humperdinck
```

Existing v2 owner certificates still verify on the new dual-key clients.
Old clients recognize only v1, so don't issue new v2 certificates until
you have a supported upgrade path for those old installations.

## 3. Stage versioned verification support before switching issuance

- Embed and test both v1 and v2 **public verification keys** in native packages
  on Windows, Apple Silicon macOS and Linux. Never fetch a replacement key
  dynamically from an untrusted endpoint.
- Test a synthetic v1 certificate on the new build **while completely offline**;
  then test a synthetic v2 certificate with the generated public key.
- Only after those tests, configure a **new** Cloudflare secret containing the
  backed-up v2 private key (never via source control).
- Change the Worker to sign only **new** certificates with v2 and to identify
  them by key ID; do not destroy the original v1 verifier or signing secret.
- Run a two-phase rollback drill: v2 failure must not invalidate v1 licenses,
  and the owner can restore v2 issuance from an encrypted backup.

## 4. Validate actual user rights

- Complimentary grants and future paid purchases must activate with authenticated
  accounts, remain valid offline indefinitely, and survive reinstall/restoration.
- Ten online device registrations are checked only at online activation; an
  exported perpetual owner certificate is **portable** and not remotely revocable.
- Validate with the exact packaged executables and no internet, not only CI.
- Never treat a successful local encrypted backup test as a completed production
  signing-key migration.

## 5. Final operator signoff

- [ ] Both encrypted v2 backup copies are stored separately from the passphrase.
- [ ] A second trusted machine successfully verifies restored key and public key.
- [ ] Installed Windows, macOS and Linux clients accept authentic v1 and v2 licenses offline.
- [ ] Cloudflare v2 signing is tested and production rollback procedure recorded.
- [ ] A restored v2 private key can resume new issuance without breaking v1 licenses.
- [ ] Owner signs/date-stamps the recovery test **without attaching any key material**.

No production secret has been read, replaced or rotated by this document.
