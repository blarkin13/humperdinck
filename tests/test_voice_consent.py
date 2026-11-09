"""Voice authorization evidence: user signatures and private signed documentation."""
import hashlib
import os
from pathlib import Path
import pytest
from backend import voice_consent as consent


def test_self_uses_explicit_typed_electronic_signature():
    with pytest.raises(consent.ConsentError):
        consent.validate("self", "", "", None)
    result = consent.validate("self", "  Jane Speaker ", "", None)
    assert result["policy"] == consent.POLICY
    assert result["speaker_name"] == "Jane Speaker"
    assert result["user_electronic_signature"] is True
    assert result["independently_verified"] is False
    assert result["signed_document_submitted"] is False


def test_third_party_must_provide_named_speaker_and_signed_file(tmp_path):
    with pytest.raises(consent.ConsentError):
        consent.validate("authorized", "Sam User", "Dana Speaker", None)
    with pytest.raises(consent.ConsentError):
        consent.validate("authorized", "Sam User", "", b"%PDF-1.4\n", "release.pdf")
    with pytest.raises(consent.ConsentError):
        consent.validate("authorized", "Sam User", "Dana Speaker", b"PK\x03\x04", "release.pdf")
    with pytest.raises(consent.ConsentError):
        consent.validate("authorized", "Sam User", "Dana Speaker", b"%PDF-1.4\n", "release.exe")
    with pytest.raises(consent.ConsentError):
        consent.validate("authorized", "Sam User", "Dana Speaker", b"%PDF-" + b"x" * (consent.MAX_DOCUMENT_BYTES+1), "release.pdf")
    document=b"%PDF-1.4\n%TEST local authorization placeholder\n"
    record=consent.validate("authorized","Sam User","Dana Speaker",document,"authorization.pdf")
    assert record["speaker"]=="authorized"
    assert record["speaker_name"]=="Dana Speaker"
    assert record["signed_document_sha256"]==hashlib.sha256(document).hexdigest()
    assert not record["independently_verified"]
    key="a"*32
    consent.store_document(tmp_path,key,document,record["signed_document_extension"])
    stored=tmp_path/"consent-evidence"/(key+".pdf")
    assert stored.read_bytes()==document
    if os.name=="posix":
        assert stored.stat().st_mode & 0o077 == 0
        assert stored.parent.stat().st_mode & 0o077 == 0
    consent.delete_document(tmp_path,key)
    assert not stored.exists()


def test_document_storage_never_allows_paths_outside_evidence_folder(tmp_path):
    for bad_id in ("../../secrets", "a"*31, "/tmp/x", "abc/def"):
        with pytest.raises(consent.ConsentError):
            consent.store_document(tmp_path,bad_id,b"%PDF-1.4", ".pdf")
        with pytest.raises(consent.ConsentError):
            consent.delete_document(tmp_path,bad_id)
    with pytest.raises(consent.ConsentError):
        consent.store_document(tmp_path,"b"*32,b"%PDF-1.4", ".html")


def test_document_cannot_be_overwritten_by_repeat_submission(tmp_path):
    key="b"*32
    consent.store_document(tmp_path,key,b"%PDF-1.4\nOriginal", ".pdf")
    with pytest.raises(FileExistsError):
        consent.store_document(tmp_path,key,b"%PDF-1.4\nChanged", ".pdf")
    assert (tmp_path/"consent-evidence"/(key+".pdf")).read_bytes().endswith(b"Original")

def test_signed_evidence_integrity_detects_deletion_and_tampering(tmp_path):
    document=b"%PDF-1.4\\n%Author signature test document\\n"
    key="c"*32
    record=consent.validate("authorized","John Uploader","Jane Speaker",document,"release.pdf")
    consent.store_document(tmp_path,key,document,record["signed_document_extension"])
    assert consent.check_stored_document(tmp_path,key,record)["integrity"]=="intact"
    evidence=tmp_path/"consent-evidence"/(key+".pdf")
    evidence.write_bytes(b"%PDF-1.4\\n%Changed")
    assert consent.check_stored_document(tmp_path,key,record)["integrity"]=="tampered"
    evidence.unlink()
    assert consent.check_stored_document(tmp_path,key,record)["integrity"]=="missing"
    assert consent.check_stored_document(tmp_path,key,{"policy":"humperdinck-voice-consent-v1"})["integrity"]=="unknown"
    own=consent.validate("self","Jane Speaker","",None)
    assert consent.check_stored_document(tmp_path,key,own)["integrity"]=="not-applicable"
