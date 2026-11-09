"""Synthetic-only migration, snapshot/restore, and fail-closed release checks."""
from __future__ import annotations

import importlib.util
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("d1drill", ROOT / "scripts/d1_migration_restore_preflight.py")
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


def baseline():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    for filename in tool.MIGRATIONS[:5]:
        db.executescript(filename.read_text(encoding="utf8"))
    db.execute("INSERT INTO auth_users(id,email,created_at) VALUES ('u1','test@example.invalid',100)")
    db.execute("INSERT INTO pro_licenses(id,user_id,status,issued_at) VALUES ('p1','u1','active',100)")
    db.execute("INSERT INTO auth_sessions(token_hash,user_id,kind,created_at,expires_at) VALUES ('s1','u1','web',100,999)")
    db.commit()
    return db


def test_preflight_is_read_only_and_reports_missing_live_migrations():
    db = baseline()
    before = db.total_changes
    status = tool.read_only_preflight(db)
    assert status["core_schema_ok"]
    assert status["foreign_keys_valid"]
    assert set(status["missing_live"]) == tool.LIVE_TABLES
    assert not status["safe_for_live_payments"]
    assert db.total_changes == before
    assert db.execute("SELECT COUNT(*) FROM pro_licenses").fetchone() == (1,)
    db.close()


def test_isolated_drill_upgrades_copy_and_restores_original_entitlements():
    db = baseline()
    before = set(tool.table_names(db))
    report = tool.isolated_migration_restore_drill(db)
    assert report["isolated_migration_schema_valid"]
    assert report["isolated_restore_schema_valid"]
    assert report["production_changed"] is False
    assert report["production_restore_verified"] is False
    assert tool.table_names(db) == before
    assert db.execute("SELECT user_id,status FROM pro_licenses").fetchone() == ("u1", "active")
    assert db.execute("SELECT token_hash FROM auth_sessions").fetchone() == ("s1",)
    db.close()


def test_invalid_foreign_key_is_detected_and_never_declared_live_ready():
    db = baseline()
    db.execute("PRAGMA foreign_keys=OFF")
    db.execute("INSERT INTO pro_licenses(id,user_id,status,issued_at) VALUES ('bad','absent','active',100)")
    db.commit()
    result = tool.read_only_preflight(db)
    assert not result["foreign_keys_valid"]
    assert not result["safe_for_live_payments"]
    db.close()


def test_full_migrated_snapshot_still_does_not_certify_production():
    db = baseline()
    for filename in tool.MIGRATIONS[5:]:
        db.executescript(filename.read_text(encoding="utf8"))
    status = tool.read_only_preflight(db)
    assert status["live_schema_ready"]
    assert status["foreign_keys_valid"]
    assert not status["safe_for_live_payments"]
    assert status["recovery_tested"] is False
    db.close()
