# Humperdinck Pro — account- and computer-bound lifetime licensing

**Owner decision (November 14, 2026):** Replace portable offline Pro licenses with signed licenses bound to the purchasing Humperdinck account and an activated computer. **Implementation is being built by Claude Code; this document states the target contract, not verified deployed behavior.** Never mark the migration complete until the Worker, desktop verifier, schema, and Windows/macOS/Linux acceptance tests pass.

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

The old source `src/pro-license.js` still contains `transfer:'portable-offline-backup'`, unrestricted `/api/account/license/backup`, and random-installation-ID registration. **Those are not the new contract.** Claude Code must update that source, desktop `backend/pro_license.py`, `backend/entitlements.py`, desktop activation/restore UX, server APIs, D1 migrations and tests together.

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

**Status:** Contract documented; implementation/rollout, actual privacy data handling, backward compatibility and cross-platform tests remain Claude Code acceptance work. Do not treat this file as proof that the new licensing protocol has shipped.
