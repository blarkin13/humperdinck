#!/usr/bin/env python3
"""Inventory EXACT staged distribution contents for third-party licensing review.

No approval is implied. The report records hashes, file sizes and candidates
for required licenses; reviewers must verify upstream terms and corresponding
source for every binary/model/sound they actually ship.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from datetime import datetime, timezone

REVIEW_EXTENSIONS={".onnx",".pt",".pth",".safetensors",".bin",".model",
                   ".dll",".so",".dylib",".a",".wav",".mp3",".flac",".ogg",
                   ".mp4",".ttf",".otf"}
NOTICE_NAMES={"LICENSE","LICENSE.md","LICENSE.txt","NOTICE","NOTICE.txt",
              "COPYING","COPYING.LGPLv2.1","COPYING.GPLv3"}


def digest(path:Path)->str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda:f.read(1024*1024),b""):
            h.update(block)
    return h.hexdigest()


def inventory(root:Path,commit:str)->dict:
    directory=root.resolve(strict=True)
    if not directory.is_dir():
        raise ValueError("Supply an extracted/staged release directory, not a binary installer")
    records=[]
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Symlink requires manual license and target review: {path.relative_to(directory)}")
        if not path.is_file():
            continue
        relative=path.relative_to(directory).as_posix()
        stat=path.stat()
        review=(path.suffix.lower() in REVIEW_EXTENSIONS or
                path.name in NOTICE_NAMES or "ffmpeg" in path.name.lower() or
                "voice" in path.name.lower() or "license" in relative.lower())
        records.append({"path":relative,"bytes":stat.st_size,"sha256":digest(path),
                        "requires_manual_license_review":review})
    if not records:
        raise ValueError("Release directory is empty")
    return {
        "schema":"humperdinck-release-inventory-v1",
        "repository_commit":commit,
        "generated_utc":datetime.now(timezone.utc).isoformat(),
        "release_root_name":directory.name,
        "files":records,
        "license_approval":"NOT APPROVED — independent upstream, build and redistribution review pending",
        "notes":[
            "Inventory captures staged files, not dynamically downloaded model weights.",
            "Verify exact model revisions, curated voice permissions, runtime licenses, FFmpeg build flags and source availability.",
            "Do not publish private recordings, tokens or customer project contents in reports.",
        ],
    }


def main()->int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root",type=Path,required=True,help="Path to extracted/staged installer content")
    parser.add_argument("--output",type=Path,required=True,help="Owner-controlled local JSON output")
    parser.add_argument("--commit",required=True,help="Git commit SHA used to build the release")
    args=parser.parse_args()
    if not args.commit or len(args.commit)<7 or not all(c in "0123456789abcdef" for c in args.commit.lower()):
        parser.error("Use a real hexadecimal Git commit SHA")
    report=inventory(args.root,args.commit)
    if args.output.exists():
        parser.error("Refusing to overwrite an existing release audit")
    args.output.parent.mkdir(parents=True,exist_ok=True)
    fd=os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w",encoding="utf-8") as f:
        json.dump(report,f,indent=2)
        f.write("\n")
    print(f"Inventory saved: {args.output} ({len(report['files'])} files)")
    print("NOT APPROVED: exact third-party redistribution rights still require review.")
    return 0


if __name__=="__main__":
    raise SystemExit(main())
