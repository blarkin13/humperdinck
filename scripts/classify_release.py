#!/usr/bin/env python3
"""Decide whether a desktop release is a free update.

A free update has live payments locked off in code and bundles no
Built-In Humperdinck Voices. Only a free update may publish without the
commercial P0 and release-rights sign-offs; anything else still needs both.
Prints "free" or "commercial".
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def classify(root: Path = ROOT) -> str:
    gate = (root / "src" / "live-commerce-release-gate.js").read_text()
    packs = (root / "backend" / "voice_packs.py").read_text()
    payments_off = re.search(r"^export const LIVE_COMMERCE_CODE_APPROVED\s*=\s*false\s*;", gate, re.M)
    voices_off = re.search(r"^ENABLED\s*=\s*False\s*$", packs, re.M)
    return "free" if payments_off and voices_off else "commercial"


if __name__ == "__main__":
    print(classify(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT))
