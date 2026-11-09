#!/usr/bin/env python3
"""Fail-closed engineering launch-readiness snapshot for Humperdinck.

This is not an automated certificate of legal rights, payment approval,
physical hardware testing, or production recovery. Those remain human gates.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from datetime import datetime, timezone


GATES = [
 ("commercial_voice_rights", "Commercial redistribution approval for all seven built-in reference voices", "manual"),
 ("frozen_dependency_rights", "Release-specific third-party model, library, audio and FFmpeg compliance review", "manual"),
 ("voice_consent_legal", "Independent legal review of signed-speaker authorization and privacy policy", "manual"),
 ("signing_v2_cloudflare", "Owner-staged v2 private signing key, recovery and verified activation", "owner"),
 ("offline_license_physical", "Offline v1/v2 certificate restoration on installed Windows, macOS, Linux packages", "physical"),
 ("windows_publisher_signing", "Microsoft-trusted publisher-signed Windows installation", "owner"),
 ("macos_notarization", "Developer ID signature, notarization and stapled macOS image", "owner"),
 ("linux_installer_acceptance", "Real Linux .deb GUI startup/install/uninstall checks", "physical"),
 ("payment_provider_approval", "Merchant-of-record approval, live account credentials and fulfillment acceptance", "owner"),
 ("privacy_deletion_retention", "Verified account export/deletion, retention and recovery policies", "engineering+legal"),
]


def report(root: Path, commit: str) -> dict:
    rights=json.loads((root/"docs/RELEASE_RIGHTS_APPROVAL.json").read_text(encoding="utf8"))
    controls=[
        {"id":gate,"description":desc,"requires":kind,
         "status":"BLOCKED / NOT INDEPENDENTLY VERIFIED"}
        for gate,desc,kind in GATES
    ]
    # A source-controlled status cannot clear human acceptance; do not use
    # source edits to convert unresolved gates to automatic APPROVED.
    return {
        "schema":"humperdinck-launch-readiness-v1",
        "captured_utc":datetime.now(timezone.utc).isoformat(),
        "source_commit":commit,
        "build_qa":{"status":"REQUIRES CI RUN CONFIRMATION",
                    "note":"Inspect the matching GitHub workflow run and its actual artifacts."},
        "release_rights_ledger":{"status":rights.get("status","UNKNOWN"),
                                 "matches_required_voice_zip":rights.get("bundled_voices_pack_sha256")
                                  =="15542ed7f3f23708ed57e0cb9e1dc99cc1d6c1bb5194d56c22394b2bcb00cd49"},
        "gates":controls,
        "commercial_release_decision":"NOT READY",
        "owner_sensitive_data_collected":False,
        "notes":"No production settings, license keys, speaker releases or payment credentials are collected by this report.",
    }


def main()->int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root",type=Path,default=Path("."))
    parser.add_argument("--commit",required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    payload=report(args.root,args.commit)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(payload,indent=2)+"\n",encoding="utf8")
    print("Launch readiness:",payload["commercial_release_decision"])
    print("Owner/legal/physical validation gates:",len(payload["gates"]))
    print("Evidence saved:",args.output)
    return 0


if __name__=="__main__":
    raise SystemExit(main())
