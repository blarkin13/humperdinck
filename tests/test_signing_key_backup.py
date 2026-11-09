"""Local-only signing-key backup recovery checks. No production key is used."""
from __future__ import annotations

import base64
import importlib.util
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
    record["public_key_base64"] = b64(b"\\0" * 32)
    with pytest.raises(module.InvalidBackup):
        module.verify_backup(record, passphrase)
