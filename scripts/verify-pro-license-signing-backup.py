#!/usr/bin/env python3
"""Verify a LOCAL encrypted Humperdinck Pro signing-key backup.

This tool never logs or exports private key bytes and does not modify Cloudflare.
Run on a trusted computer; enter the passphrase through a terminal prompt.
"""
from __future__ import annotations

import argparse
import base64
import getpass
import json
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt


class InvalidBackup(ValueError):
    """Invalid contents, incorrect passphrase or integrity check failure."""


def _decode(value: str) -> bytes:
    if not isinstance(value, str):
        raise InvalidBackup("Malformed backup field")
    try:
        return base64.b64decode(value, validate=True)
    except (ValueError, Exception) as exc:
        raise InvalidBackup("Malformed backup encoding") from exc


def verify_backup(record: dict, passphrase: str) -> dict:
    """Decrypt in memory and prove that keypair matches the recorded public key."""
    if not isinstance(record, dict) or record.get("format") != "humperdinck-pro-signing-key-backup-v1":
        raise InvalidBackup("Unrecognized backup format")
    key_id = record.get("key_id")
    if not isinstance(key_id, str) or not key_id.startswith("humperdinck-pro-ed25519-v"):
        raise InvalidBackup("Invalid key identifier")
    params = record.get("kdf", {})
    if (record.get("cipher") != "AES-256-GCM" or params.get("name") != "scrypt"
        or (params.get("n"), params.get("r"), params.get("p")) != (2**15, 8, 1)):
        raise InvalidBackup("Unsupported key derivation or encryption settings")
    salt = _decode(params.get("salt_base64"))
    nonce = _decode(record.get("nonce_base64"))
    ciphertext = _decode(record.get("private_pkcs8_ciphertext_base64"))
    expected_public = _decode(record.get("public_key_base64"))
    if len(salt) != 32 or len(nonce) != 12 or len(expected_public) != 32:
        raise InvalidBackup("Invalid backup parameters")
    if not isinstance(passphrase, str) or not passphrase:
        raise InvalidBackup("Passphrase required")
    try:
        secret = Scrypt(salt=salt, length=32, n=2**15, r=8, p=1).derive(passphrase.encode("utf-8"))
        raw = AESGCM(secret).decrypt(nonce, ciphertext, key_id.encode("utf-8"))
        key = serialization.load_der_private_key(raw, password=None)
        if not isinstance(key, Ed25519PrivateKey):
            raise InvalidBackup("Backup does not contain an Ed25519 key")
        public = key.public_key()
        actual_public = public.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        if actual_public != expected_public:
            raise InvalidBackup("Recorded public key does not match the private key")
        challenge = b"humperdinck-signing-backup-restore-check-v1"
        public.verify(key.sign(challenge), challenge)
    except InvalidBackup:
        raise
    except Exception as exc:
        raise InvalidBackup("Decryption or signature verification failed") from exc
    return {"key_id": key_id, "public_key_base64": record["public_key_base64"], "verified": True}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path,
                        help="Path to your encrypted backup file; NEVER upload it")
    args = parser.parse_args()
    file = args.input.expanduser()
    if not file.is_file() or file.stat().st_size > 64 * 1024:
        parser.error("Backup is missing or unexpectedly large")
    password = getpass.getpass("Backup passphrase (not logged): ")
    try:
        result = verify_backup(json.loads(file.read_text(encoding="utf-8")), password)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        parser.error(str(exc))
    print("LOCAL BACKUP RECOVERY VERIFIED:", result["key_id"])
    print("Public key:", result["public_key_base64"])
    print("Private key remains in memory only; Cloudflare configuration was not changed.")
    print("Keep v1 license verification active during any future versioned migration.")


if __name__ == "__main__":
    main()
