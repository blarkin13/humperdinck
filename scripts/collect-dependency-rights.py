#!/usr/bin/env python3
"""Offline third-party dependency evidence for native release candidate builds.

Capture Python installed package metadata plus npm lock identities, not verdicts.
The process never downloads dependencies or asserts redistribution permission.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from importlib import metadata
import json
from pathlib import Path
import re

SPDX_LIKE = re.compile(r"^[A-Za-z0-9.+()-]+(?:\s+(?:AND|OR|WITH)\s+[A-Za-z0-9.+()-]+)*$")


def python_inventory() -> list[dict]:
    records=[]
    for dist in metadata.distributions():
        meta=dist.metadata
        name=meta.get("Name") or getattr(dist, "name", "unknown")
        license_expression=meta.get("License-Expression")
        legacy=meta.get("License")
        classifiers=[x for x in meta.get_all("Classifier",[]) if "License ::" in x]
        homepage=meta.get("Home-page")
        project_urls=meta.get_all("Project-URL",[])
        records.append({
            "name":name,"version":dist.version,
            "license_expression":license_expression,
            "legacy_license":legacy[:300] if legacy else None,
            "license_classifiers":classifiers,
            "home_page":homepage,
            "project_urls":project_urls[:12],
            "missing_license_metadata":not (license_expression or legacy or classifiers),
        })
    return sorted(records,key=lambda x:x["name"].lower())


def npm_inventory(lock:dict) -> list[dict]:
    if not isinstance(lock,dict) or not isinstance(lock.get("packages"),dict):
        raise ValueError("Expected npm package-lock version 2/3 packages map")
    results=[]
    for location,pkg in sorted(lock["packages"].items()):
        if not location or not isinstance(pkg,dict):
            continue
        results.append({
            "location":location,
            "version":pkg.get("version"),
            "resolved":pkg.get("resolved"),
            "integrity":pkg.get("integrity"),
            "optional":bool(pkg.get("optional")),
            "dev":bool(pkg.get("dev")),
            # npm lockfiles normally OMIT license: this needs separate evidence.
            "license":pkg.get("license"),
            "license_metadata_missing":not bool(pkg.get("license")),
        })
    return results


def collect(lock:dict,commit:str)->dict:
    return {
        "schema":"humperdinck-third-party-dependency-evidence-v1",
        "generated_utc":datetime.now(timezone.utc).isoformat(),
        "git_commit":commit,
        "python":python_inventory(),
        "frontend_npm":npm_inventory(lock),
        "redistribution_clearance":"NOT APPROVED — license texts, binary linkage and per-artifact dependencies require human validation",
        "caveats":[
            "This records CI build environment dependencies, not exactly what PyInstaller froze.",
            "Missing license fields are UNKNOWN, not permission to redistribute.",
            "No model/speaker/voice recording grant is supplied by this dependency list.",
            "Review Cargo.lock, bundled binaries and FFmpeg separately.",
        ],
    }


def main()->None:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--npm-lock",type=Path,default=Path("frontend/package-lock.json"))
    p.add_argument("--commit",required=True)
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}",args.commit):
        p.error("Provide full 40-character commit hash")
    report=collect(json.loads(args.npm_lock.read_text(encoding="utf8")),args.commit)
    if args.output.exists():
        p.error("Refusing to overwrite an existing evidence report")
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
    print(f"Dependency evidence: {len(report['python'])} Python, {len(report['frontend_npm'])} npm packages")
    print("NOT APPROVED — metadata inventory alone is not commercial redistribution clearance")


if __name__=="__main__":
    main()
