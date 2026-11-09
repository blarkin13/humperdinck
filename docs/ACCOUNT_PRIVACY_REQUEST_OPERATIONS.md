# Humperdinck account privacy and deletion — pre-production operations

**Status: code prepared; migration and real-world acceptance pending.**
This checklist is not a representation that online account erasure is already
available or that any offline customer certificate can be remotely revoked.

## Data export and request entrypoints

New web-session authenticated routes, with no exposure of tokens or recovery
hashes:

- `GET /api/account/privacy/export` — user profile, linked providers,
  lifetime Pro license metadata, random registered installation IDs and the
  user's privacy request status. No bearer tokens, recovery code hashes,
  OAuth secrets or signed speaker documents.
- `POST /api/account/privacy/requests` — explicit
  `{"kind":"access|correction|deletion","confirmation":"REQUEST PRIVACY REVIEW"}`
  with same-origin validation; returns a pending request ID.
- `migrations/0005_account_privacy.sql` — private operator review queue with
  a partial unique index preventing two pending requests of the same kind
  for an account.

**Operator check:** verify migration applied before linking the controls to
customer UI or claiming self-service is available. Do not auto-delete on the
basis of one browser POST. A valid web session verifies authentication but
cannot establish all applicable legal identity and retention requirements.

## Deletion handling and retention

1. Verify requester controls the account; confirm the exact scope.
2. Produce an account export and list processors holding additional data
   (Lemon Squeezy, Cloudflare and any configured sign-in providers).
3. Preserve the minimum purchased license entitlement and legally required
   transaction records necessary for accounting, fraud, tax, chargebacks and
   lifetime Pro fulfillment/recovery. Specify concrete retention periods with
   counsel/accountant and disclose them in the public privacy policy.
4. Delete eligible optional profile information, login/recovery codes and
   connected-device session records; review links and database foreign-key
   cascades before issuing any SQL. The existing schema has a
   `pro_licenses.user_id -> auth_users.id ON DELETE CASCADE` relationship.
   **Never simply `DELETE FROM auth_users`**, because that would cascade and
   remove purchased lifetime entitlements. Design a retained minimal
   purchaser record or other non-identifying fulfillment mapping first.
5. Treat customer-owned local recordings, voice consent documents and
   installed offline certificates as files on their devices. The website
   cannot remotely delete or revoke them. Clearly instruct customers on
   local removal and exports.
6. When approved, document action and completion time, disclose preserved
   categories and reason, and mark request status `completed`. Do not
   publicly log the customer's full data export or signed voice document.

## Rollout gates

- [ ] Apply privacy request migration in a controlled environment.
- [ ] Test export on account with no license, Pro license and multiple devices.
- [ ] Verify signed-in web session, Origin/CSRF and isolation on real D1.
- [ ] Build real customer dashboard buttons and support monitoring.
- [ ] Agree retention schedule, verification procedures and processor inventory.
- [ ] Implement reviewed minimal-purchaser retention before enabling
      destructive deletion.
- [ ] Verify implementation and public privacy statements with counsel.
