#!/usr/bin/env python3
"""Inspect the exact Humperdinck reference-voice ZIP locally; never upload voice audio."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

EXPECTED_PACK_SHA256 = "6cc0ec3b6e6f85561532514795897036b86d3a601a43403f21c0570a03dc245f"


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def inspect(raw: bytes, expected_pack_sha256: str = EXPECTED_PACK_SHA256) -> dict:
    actual_pack_sha256 = sha256(raw)
    if actual_pack_sha256 != expected_pack_sha256:
        raise ValueError("Voice pack SHA256 differs from approved release; stop and review")
    with ZipFile(__import__("io").BytesIO(raw)) as bundle:
        names = bundle.namelist()
        if len(set(names)) != len(names):
            raise ValueError("Duplicate ZIP entries")
        try:
            manifest = json.loads(bundle.read("manifest.json"))
        except (KeyError, ValueError) as exc:
            raise ValueError("Missing or invalid manifest.json") from exc
        if manifest.get("format") != "humperdinck-starter-voices" or manifest.get("version") != 1:
            raise ValueError("Unexpected voice-pack manifest format/version")
        voices = manifest.get("voices")
        if not isinstance(voices, list) or len(voices) != 4:
            raise ValueError("Expected exactly four voice samples")
        identities = set()
        evidence = []
        for number, voice in enumerate(voices, 1):
            if not isinstance(voice, dict):
                raise ValueError("Malformed voice entry")
            file = voice.get("sample_file")
            expected = voice.get("sha256")
            if not isinstance(file, str) or not isinstance(expected, str):
                raise ValueError("Missing sample path or SHA256")
            if file in identities or file.startswith("/") or ".." in Path(file).parts:
                raise ValueError("Duplicate or unsafe sample file reference")
            identities.add(file)
            try:
                sample = bundle.read(file)
            except KeyError as exc:
                raise ValueError("Missing sample from ZIP") from exc
            actual = sha256(sample)
            if actual != expected:
                raise ValueError(f"Sample {number} does not match manifest SHA256")
            evidence.append({
                "sample_number": number,
                "sample_sha256": actual,
                "sample_bytes": len(sample),
                "source_audio_copyright_owner": "OWNER TO VERIFY PRIVATELY",
                "source_voice_performer": "OWNER REPORTED SELF, NOT INDEPENDENTLY VERIFIED",
                "first_party_owner_source": "OWNER REPORTED — requires operator review",
                "review_status": "NOT APPROVED",
            })
    return {
        "format": "humperdinck-private-owner-voice-evidence-v1",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "pack_sha256": actual_pack_sha256,
        "pack_bytes": len(raw),
        "sample_count": len(evidence),
        "owner_reported_source": "Owner's own recorded voice blended with Qwen",
        "samples": evidence,
        "release_rights_approved": False,
        "caveat": "This inventory verifies hashes, not creator identity or third-party rights. The owner need not sign a release to himself.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Local ZIP only; do not upload")
    parser.add_argument("--output", required=True, type=Path, help="Private JSON report; will not overwrite")
    parser.add_argument("--expected-pack-sha256", default=EXPECTED_PACK_SHA256)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Refusing to overwrite an existing rights report")
    try:
        report = inspect(args.input.read_bytes(), args.expected_pack_sha256)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {report['sample_count']} reference samples against the pinned pack;")
    print(f"wrote hash-only report to {args.output}. Rights remain NOT APPROVED.")


if __name__ == "__main__":
    main()
