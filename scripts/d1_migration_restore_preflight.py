#!/usr/bin/env python3
"""Offline-only D1 migration/restore acceptance. NEVER connects to Cloudflare.

Use a local SQLite snapshot in tests; do not feed it a production customer export
or upload a database to CI. This is not a substitute for a real D1 PITR drill.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = [ROOT / "migrations" / f"{i:04d}_{name}.sql" for i, name in [
    (1, "accounts"), (2, "pro_licenses"), (3, "account_dashboard"),
    (4, "lemon_squeezy_test"), (5, "account_privacy"),
    (6, "lemon_live_ledger"), (7, "live_disputes"),
]]
LIVE_TABLES = frozenset({
    "commerce_live_intents", "commerce_live_orders", "commerce_live_webhook_events",
    "commerce_live_disputes", "commerce_live_dispute_events",
})
CORE_TABLES = frozenset({"auth_users", "auth_sessions", "pro_licenses", "pro_devices"})


def table_names(db: sqlite3.Connection) -> set[str]:
    return {row[0] for row in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )}


def read_only_preflight(db: sqlite3.Connection) -> dict:
    """Inspect a connection; does not change schema or data."""
    names = table_names(db)
    check = list(db.execute("PRAGMA foreign_key_check"))
    missing_core = sorted(CORE_TABLES - names)
    missing_live = sorted(LIVE_TABLES - names)
    return {
        "core_schema_ok": not missing_core,
        "missing_core": missing_core,
        "live_schema_ready": not missing_live,
        "missing_live": missing_live,
        "foreign_keys_valid": not check,
        "recovery_tested": False,
        "production_migrations_applied": False,
        "safe_for_live_payments": False,
    }


def isolated_migration_restore_drill(db: sqlite3.Connection) -> dict:
    """Backup source to memory and exercise 0006/0007 on separate local copies."""
    original = sqlite3.connect(":memory:")
    db.backup(original)
    preflight = read_only_preflight(original)
    working = sqlite3.connect(":memory:")
    original.backup(working)
    working.execute("PRAGMA foreign_keys=ON")
    for filename in MIGRATIONS[5:]:
        working.executescript(filename.read_text(encoding="utf8"))
    after = read_only_preflight(working)
    if not after["live_schema_ready"] or not after["foreign_keys_valid"]:
        raise RuntimeError("Isolated migration did not produce a valid live schema")
    rollback_copy = sqlite3.connect(":memory:")
    original.backup(rollback_copy)
    before_tables = table_names(original)
    restored_tables = table_names(rollback_copy)
    if before_tables != restored_tables or LIVE_TABLES.intersection(restored_tables):
        raise RuntimeError("Isolated restore failed to preserve pre-migration schema")
    return {
        "preflight": preflight, "isolated_migration_schema_valid": True,
        "isolated_restore_schema_valid": True,
        "production_changed": False,
        "production_restore_verified": False,
    }
