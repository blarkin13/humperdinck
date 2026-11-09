"""Owner-only complimentary Pro tool: dry-run safety, SQL semantics and idempotence."""
from __future__ import annotations
import importlib.util
import json
import sqlite3
from pathlib import Path
from uuid import uuid4

import pytest

source = Path(__file__).resolve().parents[1] / "scripts/grant-complimentary-pro.py"
spec = importlib.util.spec_from_file_location("gift_pro", source)
gift = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gift)


def db():
    database = sqlite3.connect(":memory:")
    database.execute("CREATE TABLE auth_users(id TEXT PRIMARY KEY,email TEXT)")
    database.execute("""CREATE TABLE pro_licenses(
      id TEXT PRIMARY KEY,user_id TEXT UNIQUE,status TEXT,issued_at INTEGER,
      max_devices INTEGER,provider TEXT,purchase_ref TEXT UNIQUE)""")
    database.execute("INSERT INTO auth_users VALUES ('tester-1','tester@example.com')")
    database.execute("INSERT INTO auth_users VALUES ('paid-1','paid@example.com')")
    database.execute("INSERT INTO pro_licenses VALUES ('original','paid-1','active',100,10,'lemon_squeezy','order-1')")
    return database


def test_grant_uses_existing_account_and_does_not_claim_payment():
    conn = db()
    sql = gift.grant_sql("tester@example.com", str(uuid4()), "complimentary:test-1", 1794200000)
    assert "complimentary" in sql and "INSERT INTO pro_licenses" in sql
    assert conn.execute(sql).rowcount == 1
    assert conn.execute("SELECT provider,purchase_ref,max_devices FROM pro_licenses WHERE user_id='tester-1'").fetchone() == (
        "complimentary", "complimentary:test-1", 10
    )
    assert conn.execute("SELECT provider,purchase_ref FROM pro_licenses WHERE user_id='paid-1'").fetchone() == (
        "lemon_squeezy", "order-1"
    )


def test_repeat_grant_and_unknown_accounts_do_nothing():
    conn = db()
    sql = gift.grant_sql("tester@example.com", str(uuid4()), "complimentary:test-2", 1794200000)
    assert conn.execute(sql).rowcount == 1
    assert conn.execute(gift.grant_sql("tester@example.com", str(uuid4()), "complimentary:test-3", 1794200001)).rowcount == 0
    assert conn.execute(gift.grant_sql("missing@example.com", str(uuid4()), "complimentary:test-4", 1794200001)).rowcount == 0
    assert conn.execute("SELECT count(*) FROM pro_licenses").fetchone()[0] == 2


def test_ambiguous_case_insensitive_emails_are_not_granted():
    conn = db()
    conn.execute("INSERT INTO auth_users VALUES ('tester-2','TESTER@EXAMPLE.COM')")
    sql = gift.grant_sql("tester@example.com", str(uuid4()), "complimentary:test-5", 1794200000)
    assert conn.execute(sql).rowcount == 0


def test_admin_email_is_escaped_and_wranger_fails_closed():
    assert gift.sql_literal("can't@example.com") == "'can''t@example.com'"
    assert gift.EMAIL.fullmatch("tester@example.com")
    for candidate in ["test@example.com'; DROP TABLE users;", "no at symbol", "a@a", "test@example.com\n"]:
        assert gift.EMAIL.fullmatch(candidate) is None
    with pytest.raises(RuntimeError):
        gift.parse_results("not JSON")
    with pytest.raises(RuntimeError):
        gift.parse_results(json.dumps([{"success":False,"results":[]}]))
    assert gift.parse_results(json.dumps([{"success":True,"results":[]}]))[0]["success"] is True


def test_tool_dry_run_cannot_issue_a_grant(monkeypatch, capsys):
    monkeypatch.setattr(gift, "execute_sql", lambda sql, wrangler: [
        {"success":True,"results":[{"id":"tester-1","email":"tester@example.com"}]}
        if "FROM auth_users" in sql else {"success":True,"results":[]}
    ])
    monkeypatch.setattr("sys.argv", ["grant", "--email", "tester@example.com"])
    assert gift.main() == 0
    assert "DRY RUN" in capsys.readouterr().out
