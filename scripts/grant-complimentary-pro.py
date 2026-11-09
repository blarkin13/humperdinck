#!/usr/bin/env python3
"""Safely give an EXISTING Humperdinck account a complimentary lifetime Pro grant.

Owner-only CLI. Uses the maintainer's authenticated Wrangler account and the
existing D1 licensing table. No public grant endpoint, payment claim, private
signing key or Google secret is ever created by this command.

Read-only by default. --apply additionally requires explicit typed confirmation.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
DB = "humperdinck-accounts"
EMAIL = re.compile(r"^[^\s@'\";]{1,100}@[^\s@'\";]{1,150}\.[a-zA-Z]{2,30}$")


def sql_literal(value: str) -> str:
    """Safely quote a literal; this never interpolates an SQL identifier."""
    return "'" + value.replace("'", "''") + "'"


def lookup_sql(email: str) -> str:
    return ("SELECT id,email FROM auth_users WHERE lower(email)=lower("
            + sql_literal(email) + ") LIMIT 2")


def existing_sql(user_id: str) -> str:
    return ("SELECT id,status,provider,purchase_ref,max_devices FROM pro_licenses "
            "WHERE user_id=" + sql_literal(user_id) + " LIMIT 2")


def grant_sql(email: str, grant_id: str, purchase_ref: str, issued_at: int) -> str:
    """Single conditional insert, preserving all existing paid and gifted grants."""
    e, gid, ref = map(sql_literal, (email, grant_id, purchase_ref))
    return (
        "INSERT INTO pro_licenses(id,user_id,status,issued_at,max_devices,provider,purchase_ref) "
        f"SELECT {gid},u.id,'active',{int(issued_at)},10,'complimentary',{ref} "
        f"FROM auth_users AS u WHERE lower(u.email)=lower({e}) "
        f"AND (SELECT COUNT(*) FROM auth_users WHERE lower(email)=lower({e}))=1 "
        "AND NOT EXISTS (SELECT 1 FROM pro_licenses WHERE user_id=u.id)"
    )


def parse_results(output: str) -> list[dict]:
    """Fail closed if Wrangler output shape is not the expected JSON."""
    try:
        data = json.loads(output.strip())
    except json.JSONDecodeError as exc:
        raise RuntimeError("Wrangler did not return JSON; grant status is unknown") from exc
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list) or not data or any(not isinstance(x, dict) for x in data):
        raise RuntimeError("Unexpected D1 response format")
    if any(x.get("success") is not True for x in data):
        raise RuntimeError("D1 reported an unsuccessful operation")
    return data


def execute_sql(query: str, wrangler: list[str]) -> list[dict]:
    cmd = wrangler + ["d1", "execute", DB, "--remote", "--json", "--command", query]
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=120,
                            check=False)
    if result.returncode:
        raise RuntimeError("Wrangler D1 execution failed; verify local Cloudflare login "
                           "and D1 permissions. No license changes should be assumed.")
    return parse_results(result.stdout)


def rows(response: list[dict]) -> list[dict]:
    if len(response) != 1 or not isinstance(response[0].get("results"), list):
        raise RuntimeError("Unrecognized D1 query result; grant not attempted")
    return response[0]["results"]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--email", required=True, help="Exact Google account email of an existing signed-in tester")
    ap.add_argument("--apply", action="store_true", help="Grant lifetime Pro after an explicit typed confirmation")
    ap.add_argument("--wrangler", nargs="+", default=["npx", "wrangler"],
                    help="Wrangler command; default: npx wrangler")
    args = ap.parse_args()
    email = args.email.strip()
    if not EMAIL.fullmatch(email):
        ap.error("Enter one valid email address without whitespace or SQL punctuation")
    try:
        matches = rows(execute_sql(lookup_sql(email), args.wrangler))
        if len(matches) != 1:
            print("No unique existing Humperdinck account was found. Have the tester sign in first.")
            return 2
        user_id = matches[0]["id"]
        existing = rows(execute_sql(existing_sql(user_id), args.wrangler))
        print("Humperdinck account:", matches[0]["email"])
        if existing:
            print("Already has a license record:", existing[0]["status"],
                  "(provider:", existing[0].get("provider") or "unspecified", ")")
            print("No existing paid/complimentary license was replaced or modified.")
            return 3
        if not args.apply:
            print("DRY RUN: eligible for one complimentary lifetime Pro grant (10 online slots).")
            print("To grant, repeat this command with --apply. No records changed.")
            return 0
        if input(f"Type GRANT {email} to confirm: ").strip() != f"GRANT {email}":
            print("Cancelled; no changes made.")
            return 1
        import time
        identifier = str(uuid4())
        reference = "complimentary:" + identifier
        execute_sql(grant_sql(email, identifier, reference, int(time.time())), args.wrangler)
        final = rows(execute_sql(existing_sql(user_id), args.wrangler))
        if len(final) != 1 or final[0].get("purchase_ref") != reference:
            raise RuntimeError("Could not verify new grant; inspect the D1 record before retrying")
        print("COMPLIMENTARY PRO GRANTED to", email)
        print("Grant ID:", identifier)
        print("The tester can now sign into Humperdinck and activate Pro.")
        print("No payment receipt, checkout, or signing secret was created.")
        return 0
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as exc:
        print("ERROR:", exc, file=sys.stderr)
        return 4


if __name__ == "__main__":
    raise SystemExit(main())
