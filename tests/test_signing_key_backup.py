"""Local-only signing-key backup recovery checks. No production key is used."""
from __future__ import annotations

import base64
import importlib.util
import json
import shutil
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

script = Path(__file__).resolve().parents[1] / "scripts" / "verify-pro-license-signing-backup.py"
spec = importlib.util.spec_from_file_location("humperdinck_backup_verify", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def b64(data):
    return base64.b64encode(data).decode("ascii")


def fixture():
    passphrase = "testing-this-sample-passphrase-only"
    key_id = "humperdinck-pro-ed25519-v2"
    salt = bytes(range(32))
    nonce = bytes(range(12))
    signing_key = Ed25519PrivateKey.generate()
    raw = signing_key.private_bytes(
        serialization.Encoding.DER,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    public = signing_key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw,
    )
    cipher_key = Scrypt(salt=salt, length=32, n=2**15, r=8, p=1).derive(passphrase.encode())
    record = {
        "format": "humperdinck-pro-signing-key-backup-v1",
        "key_id": key_id,
        "public_key_base64": b64(public),
        "cipher": "AES-256-GCM",
        "kdf": {"name": "scrypt", "n": 2**15, "r": 8, "p": 1, "salt_base64": b64(salt)},
        "nonce_base64": b64(nonce),
        "private_pkcs8_ciphertext_base64": b64(AESGCM(cipher_key).encrypt(nonce, raw, key_id.encode())),
    }
    return record, passphrase


def test_correct_backup_can_be_restored_without_exporting_private_key():
    record, passphrase = fixture()
    result = module.verify_backup(record, passphrase)
    assert result == {
        "key_id": record["key_id"],
        "public_key_base64": record["public_key_base64"],
        "verified": True,
    }
    assert not any("private" in key for key in result)


def test_wrong_passphrase_is_rejected():
    record, _ = fixture()
    with pytest.raises(module.InvalidBackup):
        module.verify_backup(record, "wrong")


def test_tampered_ciphertext_is_rejected():
    record, passphrase = fixture()
    raw = bytearray(base64.b64decode(record["private_pkcs8_ciphertext_base64"]))
    raw[-1] ^= 1
    record["private_pkcs8_ciphertext_base64"] = b64(raw)
    with pytest.raises(module.InvalidBackup):
        module.verify_backup(record, passphrase)


def test_mismatched_public_key_is_rejected():
    record, passphrase = fixture()
    record["public_key_base64"] = b64(bytes(32))
    with pytest.raises(module.InvalidBackup):
        module.verify_backup(record, passphrase)


def test_recovery_requires_matching_independent_pinned_public_key():
    record, passphrase = fixture()
    expected = record["public_key_base64"]
    assert module.verify_backup(record, passphrase, expected_public_key=expected)["verified"]
    with pytest.raises(module.InvalidBackup, match="expected deployed public"):
        module.verify_backup(record, passphrase, expected_public_key=b64(bytes([7]) * 32))
    with pytest.raises(module.InvalidBackup):
        module.verify_backup(record, passphrase, expected_public_key="not valid base64!")
    # A self-consistent backup with the wrong signer must never pass pinned validation.
    another, another_passphrase = fixture()
    with pytest.raises(module.InvalidBackup):
        module.verify_backup(another, another_passphrase, expected_public_key=expected)


def test_two_separate_encrypted_copies_survive_corruption_of_one_copy(tmp_path):
    record, passphrase = fixture()
    source=tmp_path/"primary"/"encrypted-backup.json"
    second=tmp_path/"separate-copy"/"encrypted-backup.json"
    source.parent.mkdir()
    second.parent.mkdir()
    source.write_text(json.dumps(record), encoding="utf-8")
    shutil.copyfile(source, second)
    expected=record["public_key_base64"]
    assert module.verify_backup(json.loads(source.read_text()), passphrase,
                                expected_public_key=expected)["verified"]
    assert module.verify_backup(json.loads(second.read_text()), passphrase,
                                expected_public_key=expected)["verified"]
    damaged=json.loads(second.read_text())
    damaged["nonce_base64"]=b64(bytes([9]) * 12)
    second.write_text(json.dumps(damaged), encoding="utf-8")
    with pytest.raises(module.InvalidBackup):
        module.verify_backup(json.loads(second.read_text()), passphrase,
                             expected_public_key=expected)
    assert module.verify_backup(json.loads(source.read_text()), passphrase,
                                expected_public_key=expected)["verified"]
    with pytest.raises(module.InvalidBackup):
        module.verify_backup(json.loads(source.read_text()), "wrong-passphrase",
                             expected_public_key=expected)
