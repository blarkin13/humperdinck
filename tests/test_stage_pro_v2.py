"""A staged v2 signer is recovered in memory only and never activates v2."""
from __future__ import annotations
import base64
import importlib.util
from pathlib import Path
import secrets
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

SRC=Path(__file__).resolve().parents[1]/"scripts/stage-pro-v2-signing-key.py"
spec=importlib.util.spec_from_file_location("stage_pro_v2",SRC)
tool=importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


def make_backup(monkeypatch, password="Some strong test passphrase!"):
    secret=Ed25519PrivateKey.generate()
    raw=secret.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption())
    pub=secret.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw)
    monkeypatch.setattr(tool,"PINNED_PUBLIC",base64.b64encode(pub).decode())
    b64=lambda b:base64.b64encode(b).decode()
    salt=secrets.token_bytes(32)
    nonce=secrets.token_bytes(12)
    derived=Scrypt(salt=salt,length=32,n=32768,r=8,p=1).derive(password.encode())
    backup={
        "format":"humperdinck-pro-signing-key-backup-v1","key_id":tool.KEY_ID,
        "public_key_base64":b64(pub),"cipher":"AES-256-GCM",
        "kdf":{"name":"scrypt","n":32768,"r":8,"p":1,"salt_base64":b64(salt)},
        "nonce_base64":b64(nonce),
        "private_pkcs8_ciphertext_base64":b64(AESGCM(derived).encrypt(nonce,raw,tool.KEY_ID.encode())),
    }
    return backup,raw


def test_correct_backup_restores_pkcs8_without_writing_to_disk(monkeypatch):
    backup,der=make_backup(monkeypatch)
    assert tool.extract_key(backup,"Some strong test passphrase!")==der
    with pytest.raises(ValueError):
        tool.extract_key(backup,"incorrect password")


def test_mismatched_public_key_and_wrong_version_are_blocked(monkeypatch):
    backup,_=make_backup(monkeypatch)
    monkeypatch.setattr(tool,"PINNED_PUBLIC",base64.b64encode(b"0"*32).decode())
    with pytest.raises(ValueError):
        tool.extract_key(backup,"Some strong test passphrase!")
    backup["key_id"]="humperdinck-pro-ed25519-v1"
    with pytest.raises(ValueError):
        tool.extract_key(backup,"Some strong test passphrase!")
