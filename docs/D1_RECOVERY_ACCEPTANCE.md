# P0 — Cloudflare D1 schema, backup, migration and recovery acceptance

**Status: read-only production audit + isolated restore rehearsal; NOT a
production restore or migration.** No customer data, signing keys or live
checkout configuration are modified by these tests.

## Verified production observations — November 9, 2026

- Database: `humperdinck-accounts`, Cloudflare D1 production.
- Read-only `sqlite_master` inspection found normal auth, Pro, privacy,
  and test-commerce tables and indexes; commerce-live tables from staged
  migrations `0006` and `0007` were absent.
- Cloudflare D1 time-travel bookmark endpoint responded successfully.
- A bookmark's existence does **not** prove that an actual restore succeeded,
  nor that the restored database contains the necessary accounts/licensing data.
- Existing live payment HTTP routes remain blocked with 503.
- As of this audit, production D1's tracked migration history was not
  independently reconstructed. Do not assume Wrangler migrations are applied
  merely because equivalent tables are present.

## Completed source-only acceptance

`scripts/d1_migration_restore_preflight.py` reads the schema on a local
SQLite connection, reports missing tables and FK integrity, and exercises
the staged live-ledger/disputes migrations **only on an in-memory copy**.
It restores a separate in-memory pre-migration snapshot and checks schema
consistency. The regression suite `tests/test_d1_migration_restore_preflight.py`
also checks that the original account, active Pro grant, and session persist,
and that missing or invalid schema never claims production readiness.

`tests/d1-ledger-integrity.test.mjs` additionally covers unique order,
license and event constraints and simulated atomic rollback.

## Required real-world recovery drill — NOT DONE

1. Obtain an independent operator-approved maintenance window and exact
   production target confirmation. Record current Worker version and routes.
2. Read **only metadata** for a fresh D1 time-travel bookmark; do not paste
   private customer data into tickets, chats, or source control.
3. Follow Cloudflare's documented non-destructive backup/restore approach
   on an isolated replacement D1 database, using authorized export or PITR
   tooling. **Do not issue a restore request against production.**
4. Compare schema, count-only account/license/order summaries, referential
   integrity and the expected records on the replacement. Do not print PII.
5. Exercise an explicit rollback in the isolated environment; verify sign-in,
   Pro license backup, 10-device limits, test checkout and replay/reconciliation.
6. Record dates, Cloudflare deployment versions, the safe bookmark reference,
   redacted execution result, owner signoff, and restore outcome in the
   release evidence tracker. Confirm a support contact and responsible
   recovery operator.
7. Only after successful evidence and legal/merchant approval, separately
   stage `0006` and `0007` in D1 and add a reviewed production migration.
   Production live checkout and Pro issuance still require a separate launch.

Never interpret a green CI run or source-controlled status flag as evidence
that a production restore took place.
