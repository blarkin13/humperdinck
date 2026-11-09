"""Local-first, privacy-minimizing evidence for personal voice authorization.

Attestation != verified signature. For another speaker, require a signed
document supplied by the uploader, store it privately on the local computer,
and retain an SHA-256 binding to the imported reference. No cloud transfer.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import re
import secrets

POLICY = "humperdinck-voice-consent-v2"
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
MAX_NAME = 120
ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


class ConsentError(ValueError):
    pass


def _name(value: str, label: str) -> str:
    value = (value or "").strip()
    if not 2 <= len(value) <= MAX_NAME or any(ord(x) < 32 for x in value):
        raise ConsentError(f"{label} must contain 2–120 printable characters")
    return value


def validate(subject: str, signed_by: str, speaker: str, evidence: bytes | None,
             filename: str = "") -> dict:
    """Validate evidence TYPE and user assertion; does not authenticate identity."""
    signed_by = _name(signed_by, "Signing user's full name")
    if subject == "self":
        if evidence:
            raise ConsentError("Self voice consent uses your own typed electronic signature")
        speaker = signed_by
        evidence_ext = None
    elif subject == "authorized":
        speaker = _name(speaker, "Speaker's full name")
        if not evidence or len(evidence) > MAX_DOCUMENT_BYTES:
            raise ConsentError("A signed third-party voice authorization (maximum 5 MB) is required")
        # Accept inert PDF or static images only; no scripts or archives.
        if evidence.startswith(b"%PDF-") and filename.lower().endswith(".pdf"):
            evidence_ext = ".pdf"
        elif evidence.startswith(b"\x89PNG\r\n\x1a\n") and filename.lower().endswith(".png"):
            evidence_ext = ".png"
        elif evidence.startswith(b"\xff\xd8\xff") and filename.lower().endswith((".jpg", ".jpeg")):
            evidence_ext = ".jpg"
        else:
            raise ConsentError("Authorization must be an actual PDF, PNG or JPEG signed document")
    else:
        raise ConsentError("Select your own voice or third-party signed authorization")
    return {
        "policy": POLICY,
        "speaker": subject,
        "speaker_name": speaker,
        "signed_by": signed_by,
        "accepted_at": datetime.now(timezone.utc).isoformat(),
        "user_electronic_signature": subject == "self",
        "independently_verified": False,
        "signed_document_submitted": evidence_ext is not None,
        "signed_document_sha256": hashlib.sha256(evidence).hexdigest() if evidence_ext else None,
        "signed_document_extension": evidence_ext,
        "notice": "Uploader declaration; document contents and signatures have not been independently authenticated",
    }


def store_document(root: Path, voice_id: str, evidence: bytes, extension: str) -> None:
    if not ID_PATTERN.fullmatch(voice_id) or extension not in {".pdf", ".png", ".jpg"}:
        raise ConsentError("Invalid authorization document ID or extension")
    folder = Path(root) / "consent-evidence"
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name == "posix":
        folder.chmod(0o700)
    target = folder / (voice_id + extension)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(evidence)
    except BaseException:
        target.unlink(missing_ok=True)
        raise



def check_stored_document(root: Path, voice_id: str, record: dict) -> dict:
    """Check the privately stored authorization still matches recorded SHA-256.

    Does not authenticate the speaker's signature or authorization scope.
    Returns only integrity status; never exports signed documents.
    """
    if not ID_PATTERN.fullmatch(voice_id):
        raise ConsentError("Invalid voice ID")
    if not isinstance(record, dict) or record.get("policy") != POLICY:
        return {"integrity": "unknown", "reason": "legacy-or-missing-consent"}
    if record.get("speaker") == "self":
        return {"integrity": "not-applicable", "reason": "self-electronic-declaration"}
    if record.get("speaker") != "authorized":
        return {"integrity": "invalid", "reason": "unknown-consent-subject"}
    ext = record.get("signed_document_extension")
    expected = record.get("signed_document_sha256")
    if ext not in {".pdf", ".png", ".jpg"} or not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
        return {"integrity": "invalid", "reason": "missing-signed-evidence-hash"}
    file = Path(root) / "consent-evidence" / (voice_id + ext)
    if file.is_symlink() or not file.is_file():
        return {"integrity": "missing", "reason": "signed-evidence-unavailable"}
    if file.stat().st_size > MAX_DOCUMENT_BYTES:
        return {"integrity": "invalid", "reason": "oversized-evidence"}
    actual = hashlib.sha256(file.read_bytes()).hexdigest()
    if not secrets.compare_digest(actual, expected):
        return {"integrity": "tampered", "reason": "signed-evidence-mismatch"}
    return {"integrity": "intact", "reason": "sha256-match-not-signature-verification"}

def delete_document(root: Path, voice_id: str) -> None:
    if not ID_PATTERN.fullmatch(voice_id):
        raise ConsentError("Invalid voice ID")
    for ext in (".pdf", ".png", ".jpg"):
        (Path(root) / "consent-evidence" / (voice_id + ext)).unlink(missing_ok=True)
