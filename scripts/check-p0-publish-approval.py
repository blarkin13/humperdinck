#!/usr/bin/env python3
"""Fail-closed, exact-build commercial publisher approval.

Input MUST come from an operator-controlled GitHub Actions secret, not a
committed JSON file. This tool checks assertions, it cannot independently
verify evidence or replace legal, merchant, security or physical QA review.
"""
import argparse
from datetime import datetime, timezone
import json
import re
import sys

REQUIRED = (
    "merchant_account_and_refund_policy",
    "voice_and_asset_commercial_rights",
    "terms_privacy_and_signed_consent",
    "physical_windows_macos_linux_acceptance",
    "pro_signing_key_independent_restore",
    "cloudflare_d1_restore_and_rollback",
    "production_payment_fulfillment",
    "account_deletion_retention_policy",
)


def validate(data, *, version, commit, now=None):
    now = now or datetime.now(timezone.utc)
    if not isinstance(data, dict) or data.get("schema") != "humperdinck-commercial-launch-approval-v1":
        return False, "Approval format is missing"
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        return False, "Invalid release version"
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        return False, "Exact source commit is required"
    if data.get("version") != version or data.get("source_commit") != commit:
        return False, "Approval is for a different version or source commit"
    if not isinstance(data.get("approver"), str) or len(data["approver"].strip()) < 3:
        return False, "Human owner approval is missing"
    try:
        expiry = datetime.fromisoformat(data["expires_utc"].replace("Z", "+00:00"))
        if expiry.tzinfo is None or expiry <= now or expiry > now.replace(year=now.year + 1):
            return False, "Approval expired, unbounded or not UTC aware"
    except (KeyError, AttributeError, ValueError, TypeError):
        return False, "Approval expiry is invalid"
    gates = data.get("gates")
    if not isinstance(gates, dict):
        return False, "No external approval gates provided"
    for gate in REQUIRED:
        item = gates.get(gate)
        if not isinstance(item, dict) or item.get("approved") is not True:
            return False, f"Unapproved gate: {gate}"
        if not isinstance(item.get("evidence_ref"), str) or not re.fullmatch(r"[A-Za-z0-9_.:/-]{3,120}", item["evidence_ref"]):
            return False, f"Evidence reference missing for: {gate}"
    return True, "Exact-build external commercial approval validated (assertions only)"


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest",required=True)
    parser.add_argument("--version",required=True)
    parser.add_argument("--commit",required=True)
    args=parser.parse_args()
    try:
        raw=sys.stdin.read() if args.manifest=="-" else open(args.manifest,encoding="utf8").read()
        data=json.loads(raw)
    except (OSError,ValueError):
        print("External approval unavailable or invalid",file=sys.stderr)
        return 1
    ok,reason=validate(data,version=args.version,commit=args.commit)
    print(reason,file=sys.stdout if ok else sys.stderr)
    return 0 if ok else 1


if __name__=="__main__":
    raise SystemExit(main())
