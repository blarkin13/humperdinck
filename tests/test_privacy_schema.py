"""Verify privacy request migrations do not silently destroy Pro entitlements."""
from pathlib import Path
import sqlite3
import pytest

ROOT=Path(__file__).resolve().parents[1]


@pytest.fixture()
def db():
    connection=sqlite3.connect(":memory:")
    connection.execute("PRAGMA foreign_keys=ON")
    for n in (1,2,3,4,5):
        name=next((ROOT/"migrations").glob(f"{n:04d}_*.sql"))
        connection.executescript(name.read_text(encoding="utf8"))
    connection.execute("INSERT INTO auth_users(id,created_at) VALUES (?,?)",("u1",42))
    connection.execute(
        "INSERT INTO pro_licenses(id,user_id,status,issued_at,provider,purchase_ref) "
        "VALUES (?,?,?,?,?,?)",("perpetual-1","u1","active",42,"complimentary","cmp-1")
    )
    yield connection
    connection.close()


def test_privacy_request_does_not_delete_purchased_grant(db):
    db.execute("INSERT INTO auth_privacy_requests(id,user_id,kind,status,created_at) "
               "VALUES (?,?,?,?,?)",("request-1","u1","deletion","pending",50))
    assert db.execute("SELECT status FROM pro_licenses WHERE user_id=?",("u1",)).fetchone()==("active",)
    assert db.execute("SELECT kind FROM auth_privacy_requests WHERE user_id=?",("u1",)).fetchone()==("deletion",)


def test_only_one_pending_request_per_kind(db):
    db.execute("INSERT INTO auth_privacy_requests(id,user_id,kind,status,created_at) "
               "VALUES (?,?,?,?,?)",("r1","u1","access","pending",50))
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO auth_privacy_requests(id,user_id,kind,status,created_at) "
                   "VALUES (?,?,?,?,?)",("r2","u1","access","pending",51))
    db.execute("UPDATE auth_privacy_requests SET status='completed' WHERE id='r1'")
    db.execute("INSERT INTO auth_privacy_requests(id,user_id,kind,status,created_at) "
               "VALUES (?,?,?,?,?)",("r2","u1","access","pending",52))


def test_user_delete_would_destroy_lifetime_grant_and_must_not_be_used(db):
    db.execute("SAVEPOINT deletion_risk")
    db.execute("DELETE FROM auth_users WHERE id='u1'")
    assert db.execute("SELECT id FROM pro_licenses WHERE user_id='u1'").fetchone() is None
    db.execute("ROLLBACK TO SAVEPOINT deletion_risk")
    assert db.execute("SELECT id FROM pro_licenses WHERE user_id='u1'").fetchone()==("perpetual-1",)
