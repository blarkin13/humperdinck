"""Check official Humperdinck desktop releases without executing unsigned binaries."""
import json
import os
import re
import sys
from urllib.request import Request,urlopen

REPO="blarkin13/humperdinck"
API=f"https://api.github.com/repos/{REPO}/releases?per_page=20"
VERSION=os.environ.get("HUMPERDINCK_NATIVE_VERSION","0.1.0")
TAG=re.compile(r"^desktop-v(\d+)\.(\d+)\.(\d+)$")


def version(value):
    match=re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)",value)
    return tuple(map(int,match.groups())) if match else (0,0,0)


def installer_asset(assets):
    ext=".dmg" if sys.platform=="darwin" else ".exe" if sys.platform=="win32" else ".deb"
    for asset in assets:
        name=asset.get("name","")
        url=asset.get("browser_download_url","")
        if name.lower().endswith(ext) and url.startswith(f"https://github.com/{REPO}/releases/download/desktop-v"):
            return {"name":name,"url":url}
    return None


def check():
    req=Request(API,headers={"User-Agent":"Humperdinck-NativeUpdater/1.0",
                             "Accept":"application/vnd.github+json"})
    with urlopen(req,timeout=9) as response:
        releases=json.load(response)
    if not isinstance(releases,list):
        raise ValueError("Unexpected GitHub release response")
    available=[]
    for item in releases:
        match=TAG.fullmatch(item.get("tag_name",""))
        if not match or item.get("draft") or item.get("prerelease"):
            continue
        ver=tuple(map(int,match.groups()))
        if ver<=version(VERSION):
            continue
        asset=installer_asset(item.get("assets") or [])
        if asset:
            available.append((ver,item,asset))
    if available:
        ver,item,asset=max(available,key=lambda entry:entry[0])
        return {"available":True,"latest":".".join(map(str,ver)),"current_version":VERSION,
                "summary":item.get("name") or "Desktop update","date":item.get("published_at") or "",
                "url":item.get("html_url") or f"https://github.com/{REPO}/releases",
                "download_url":asset["url"],"download_name":asset["name"],
                "changed_files":[],"removed_files":[],"can_install":False,"can_download":True}
    return {"available":False,"reason":"No newer desktop binary release is published on GitHub",
            "changed_files":[],"removed_files":[],"can_install":False,"can_download":False,
            "current_version":VERSION}
