#!/usr/bin/env python3
"""Basic OS-native release container checks. Not equivalent to install/GUI QA."""
from __future__ import annotations
import argparse
from pathlib import Path
import subprocess
import sys


def inspect(platform:str,bundle:Path)->dict:
    if not bundle.is_file() or bundle.stat().st_size<2_000_000:
        raise ValueError("Missing or implausibly small installer")
    if platform=="windows":
        with bundle.open("rb") as source:
            if source.read(2)!=b"MZ":raise ValueError("Windows installer is not an EXE")
        return {"container":"Windows EXE", "note":"PE header present; real install and signature validation remain separate"}
    if platform=="linux":
        info=subprocess.run(["dpkg-deb","--info",str(bundle)],check=True,capture_output=True,text=True,timeout=45)
        listing=subprocess.run(["dpkg-deb","--contents",str(bundle)],check=True,capture_output=True,text=True,timeout=45)
        if "Package: humperdinck" not in info.stdout.lower().replace("humperdinck","humperdinck"):
            # Debian control metadata is case sensitive, but the package itself can
            # be renamed by Tauri; verify the source/target branding in contents.
            if "humperdinck" not in info.stdout.lower():raise ValueError("Unexpected Linux package")
        if "humperdinck" not in listing.stdout.lower():raise ValueError("Expected Linux application payload missing")
        return {"container":"Debian DEB", "note":"Control metadata and files readable; install GUI QA remains separate"}
    if platform=="macos":
        run=subprocess.run(["hdiutil","imageinfo",str(bundle)],check=True,capture_output=True,text=True,timeout=45)
        if "UDIF" not in run.stdout.upper() and "FORMAT" not in run.stdout.upper():
            raise ValueError("Unrecognized macOS disk image")
        return {"container":"macOS DMG", "note":"Readable Apple disk image; app codesign smoke checked elsewhere"}
    raise ValueError("Unsupported platform")


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--platform",required=True,choices=("windows","macos","linux"))
    p.add_argument("--file",required=True,type=Path)
    a=p.parse_args()
    status=inspect(a.platform,a.file)
    print(status["container"]+":",status["note"])
if __name__=="__main__":main()
