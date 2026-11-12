"""Tests for local-only owner voice evidence reporting."""
import hashlib
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "scripts" / "inspect-owner-voice-pack-rights.py"
spec = importlib.util.spec_from_file_location("owner_voice_rights", PATH)
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


def make_zip(corrupt_sample=False, missing_voice=False):
    samples = [f"owner-speech-{index}".encode() for index in range(4)]
    manifest = {
        "format": "humperdinck-starter-voices",
        "version": 1,
        "voices": [
            {"name": f"Sample {i+1}", "sample_file": f"voices/{i+1}.wav",
             "sha256": hashlib.sha256(data).hexdigest()}
            for i, data in enumerate(samples[:3] if missing_voice else samples)
        ],
    }
    out = BytesIO()
    with ZipFile(out, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        for i, data in enumerate(samples):
            archive.writestr(f"voices/{i+1}.wav", b"corrupted" if corrupt_sample and i == 2 else data)
    return out.getvalue()


class OwnerVoiceEvidenceTests(unittest.TestCase):
    def test_four_matching_sha256_reports_remain_unapproved(self):
        raw = make_zip()
        result = tool.inspect(raw, hashlib.sha256(raw).hexdigest())
        self.assertEqual(result["sample_count"], 4)
        self.assertFalse(result["release_rights_approved"])
        self.assertEqual(len({entry["sample_sha256"] for entry in result["samples"]}), 4)
        self.assertTrue(all(entry["review_status"] == "NOT APPROVED" for entry in result["samples"]))
        self.assertNotIn("owner-speech", json.dumps(result))

    def test_wrong_pinned_zip_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "differs"):
            tool.inspect(make_zip())

    def test_changed_sample_fails_manifest_hash(self):
        raw = make_zip(corrupt_sample=True)
        with self.assertRaisesRegex(ValueError, "does not match"):
            tool.inspect(raw, hashlib.sha256(raw).hexdigest())

    def test_missing_fourth_voice_fails(self):
        raw = make_zip(missing_voice=True)
        with self.assertRaisesRegex(ValueError, "exactly four"):
            tool.inspect(raw, hashlib.sha256(raw).hexdigest())


if __name__ == "__main__":
    unittest.main()
