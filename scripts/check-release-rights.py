#!/usr/bin/env python3
"""Reject public desktop releases until an operator reviewed exact rights.

This is a tamper-evident decision ledger, NOT automatic verification of a
speaker's signature or legal certification. Privately retain original evidence.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys

HASH = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
PACK = "15542ed7f3f23708ed57e0cb9e1dc99cc1d6c1bb5194d56c22394b2bcb00cd49"


def check(record: dict, version: str, commit: str) -> list[str]:
    problems=[]
    if record.get("format")!="humperdinck-release-rights-v1": problems.append("Unknown review format")
    if record.get("status")!="CLEARED": problems.append("Release rights not approved")
    if record.get("version")!=version: problems.append("Approval does not match the release version")
    if record.get("reviewed_commit")!=commit: problems.append("Approval does not match the exact build commit")
    if record.get("bundled_voices_pack_sha256")!=PACK: problems.append("Bundled voice pack digest changed")
    if not isinstance(record.get("reviewer"),str) or len(record["reviewer"].strip())<4:
        problems.append("Missing named reviewer")
    try:
        datetime.fromisoformat(record["reviewed_utc"].replace("Z","+00:00"))
    except (AttributeError,TypeError,ValueError):
        problems.append("Missing valid review date")
    if record.get("sound_sources_archived_and_verified") is not True:
        problems.append("Original sound licenses and normalized audio not archived/checked")
    if record.get("all_frozen_dependencies_and_notices_verified") is not True:
        problems.append("Frozen dependency licenses and third-party notices not approved")
    if record.get("ffmpeg_bundled") is True and record.get("ffmpeg_exact_build_reviewed") is not True:
        problems.append("Bundled FFmpeg executable build was not approved")
    voices=record.get("voice_permissions")
    if not isinstance(voices,list) or len(voices)!=7:
        problems.append("All seven shipped voices need independent recorded permission evidence")
    else:
        samples=set()
        for entry in voices:
            if not isinstance(entry,dict):
                problems.append("Malformed individual voice grant");continue
            sample=entry.get("sample_sha256")
            if not isinstance(sample,str) or not HASH.fullmatch(sample):
                problems.append("Missing exact voice sample SHA256");continue
            if sample in samples: problems.append("Duplicate voice evidence")
            samples.add(sample)
            for field in ("signed_performer_release_sha256","recording_copyright_grant_sha256"):
                evidence=entry.get(field)
                if not isinstance(evidence,str) or not HASH.fullmatch(evidence):
                    problems.append(f"Missing independent private evidence checksum: {field}")
            for field in ("ai_voice_recreation_allowed","commercial_redistribution_allowed","reference_file_sublicensing_allowed"):
                if entry.get(field) is not True:
                    problems.append(f"Voice sample {sample[:8]} has not cleared {field}")
    return problems


def main()->int:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest",type=Path,default=Path("docs/RELEASE_RIGHTS_APPROVAL.json"),
                   help="Rights approval ledger file, or - for operator-controlled GitHub secret on stdin")
    p.add_argument("--version",required=True)
    p.add_argument("--commit",required=True)
    args=p.parse_args()
    try:
        record=json.loads(sys.stdin.read() if str(args.manifest)=="-" else args.manifest.read_text(encoding="utf8"))
    except (OSError,ValueError):
        print("BLOCKED: release-rights approval ledger missing or invalid")
        return 1
    failures=check(record,args.version,args.commit)
    for issue in failures:print("BLOCKED:",issue)
    if failures:return 1
    print("Operator-signed evidence ledger is internally complete for this exact release.")
    print("Independent legal and source-record validation must be retained separately.")
    return 0


if __name__=="__main__":
    raise SystemExit(main())
