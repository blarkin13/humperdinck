# Humperdinck Pro — account- and computer-bound lifetime licensing

**Owner decision (November 14, 2026):** Replace portable offline Pro licenses with signed licenses bound to the purchasing Humperdinck account and an activated computer. **Implementation merged in PR #257 on November 14, 2026, but production behavior and three-OS packaged acceptance remain unverified.** Never mark the migration complete until the Worker, desktop verifier, schema, and Windows/macOS/Linux acceptance tests pass.

## Customer contract

- A $49 one-time Pro purchase belongs to the customer's account, with **up to ten activated computers**. There is no recurring software-license fee or periodic online entitlement check.
- First activation on each computer requires signing into that account. The desktop derives a **salted hash** from the macOS hardware UUID, Windows `MachineGuid`, or Linux `/etc/machine-id`; **the raw ID is never sent**. The bound signed license identifies its account and hashed computer identity.
- Once activated, that computer can use all licensed Pro features **fully offline**, without recurring sign-in or check-ins.
- The same license copied onto a second computer, or presented while signed into a different account, grants **Free**, not Pro.
- A new computer or operating-system reinstall requires a new sign-in and activation. A ten-device cap applies; customers release slots from the Account page.
- If the service closes, existing activated computers can keep using Pro offline. New or reinstalled computers cannot activate once sign-in/activation services are unavailable.
- **Grandfathering:** Previously issued licenses keep working as issued. The next sign-in on their computer replaces them with a bound license. A customer-facing transition/notice and legal review are required; do not revoke legacy certificates retrospectively. Existing temporary beta entitlements keep their original expiration and do not become purchased lifetime Pro merely through reactivation.

## Security and privacy architecture — Claude Code ownership

- Keep Ed25519 private signing keys only in Cloudflare Worker secrets and securely retained signing-key backups; embed the corresponding public key for offline verification in the desktop client. Preserve verification of previously issued certificates and public keys during rotation.
- Bind signed payloads cryptographically to the authorized account and hashed computer ID. Compare the locally recomputed hash with the signed binding on every local Pro entitlement check. A mismatched account or machine falls back to Free. Avoid trust in only a UI check.
- Derive/send **only** the salted computer-ID hash, not raw hardware UUID, `MachineGuid`, `machine-id`, serial, MAC address or unredacted identifiers. Salt format, normalization, Windows/Linux identifiers, OS reinstall behavior, and privacy implications require implementation tests.
- The server stores the account linkage, salted identifier hash, activation status and minimum necessary timestamps. The hash is a persistent device identifier and needs restricted access and an approved retention/deletion lifecycle, including slot release, account deletion, backups and lawful holds.
- Enforce ten active registrations transactionally, including simultaneous requests, reclaiming the same computer, slot release and reactivation. Online deactivation does **not** magically revoke previously saved offline functionality; align the UI disclosure with actual behavior.
- Keep account authentication mandatory for issuance and computer reactivation, but never require online checks for continued offline use on the already-activated computer.
- Existing shipped v1 portable certificates need a verified backward-compatible migration path on the next sign-in and tests proving no involuntary loss of old working licenses.

## API and desktop migration checklist (implementation owner: Claude Code)

PR #257 updated `src/pro-license.js` and `backend/pro_license.py` to support signed account/device-bound v2 certificates; the `/api/account/license/backup` route now returns HTTP 410 for purchased Pro. However, `/api/account/license/activate` currently accepts a missing `device_hash` and signs a v1 portable certificate in that case. This appears to support older clients but must have an explicit, tested eligibility/sunset policy so new paid entitlements cannot bypass device binding. Verify the actual shipped client/server versions and acceptance behavior.

Required acceptance:

1. Sign-in and payment/entitlement checks precede first activation. A forged payment, other account or reused license cannot grant Pro.
2. Verify correct account + correct computer fully offline after activation. Check no periodic network check-in.
3. Copy the signed file to another computer; verify Free. Present it under another account; verify Free.
4. Test tenth and eleventh computer, concurrent activation races, releasing a device, reclaiming the same machine and replacing/reinstalling OSes on all three platforms.
5. Validate no raw computer ID leaves the desktop in HTTP payloads, logs, diagnostics, support exports or error reporting. Check salted-hash stability and compromise implications.
6. Test legacy certificates offline before sign-in; after sign-in confirm bound replacement without destroying the former customer's effective access.
7. With account/activation service unavailable, verify previously activated machines remain Pro offline and new machines cannot activate.
8. Confirm deletion/revocation notices, retained merchant data, privacy export, account device management, refund/dispute behavior and backups match the binding design.

## Pricing and policy boundaries

Free local use does not require a sign-in. Pro is a one-time lifetime **account-and-computer-bound** license for ten activations, not a transferable/offline-restorable license for arbitrary new computers. A lifetime purchase includes Pro software updates subject to published platform compatibility limits, not an indefinite promise that Humperdinck's online activation service will remain running.

Published Terms, Privacy, Software License, Refund Policy and legal review packet must disclose these constraints. The voluntary refund policy remains unchanged; statutory remedies and pre-existing customer/beta promises require counsel review.

**Status (2026-11-14 review):** PR #257 merged and reported JS 360/360 plus five pre-existing Python failures; Cloudflare production Worker deployment `b1ea3f5e-9f60-4697-8a48-b44324ad8985` received 100% traffic at 19:24:49 UTC. This does not prove the deployed binary and every static policy asset match the GitHub commit. Physical Windows/macOS/Linux acceptance, activation protocol verification, legal review and production policy publication checks remain OPEN. Do not mark rollout or legal approval complete.\n\n## November 14 review findings requiring release acceptance\n\n- **P0 compatibility boundary:** Server activation with omitted `device_hash` still produces v1 portable certificates. Establish the intended legacy-client eligibility and cutoff; ensure modern desktop versions and new purchases cannot obtain transferable licenses through this path. Preserve genuine existing customer rights without minting new unrestricted certificates inadvertently.\n- **P0 persistent device identifier:** `backend/pro_license.py` uses a fixed application-wide salt (`humperdinck-pro-device-v1:`) to hash OS device IDs. This is a pseudonymous stable identifier, not an anonymization mechanism. Validate disclosure, access controls, retention and deletion. The privacy notice must not imply an untraceable identifier.\n- **P1 reinstall consistency:** macOS hardware UUID is generally machine-based, while Windows MachineGuid and Linux machine-id may change after OS reinstall or image cloning. Verify seat reclaim and reactivation behavior; document cases where releasing a slot is required.\n- **P1 offline/legacy behavior:** Verify signed v2 offline restart, offline access after account deletion, legacy v1 grandfathering, and transitions on all supported installers. Server-side deactivation cannot by itself revoke an already-saved perpetual offline certificate.\n- **Legal approval outstanding:** Qualified reviewer should evaluate the $49 lifetime/update promise, ten-device limits, service shutdown/activation dependence, materially changed portable-license commitments, account deletion consequences, signed third-party voice consent, consumer remedies, and device-hash privacy policy. Do not conflate this engineering review with a legal opinion.
