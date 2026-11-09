#!/usr/bin/env python3
"""Stage owner-held encrypted v2 Pro signer in Cloudflare without activating it.

Runs ONLY on the owner's trusted machine. Never writes a plaintext secret
to disk or exposes it as a command argument, environment variable or log.
Does not change PRO_LICENSE_ACTIVE_KEY_ID or touch the v1 signing secret.
"""
from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

KEY_ID = "humperdinck-pro-ed25519-v2"
PINNED_PUBLIC = "LJ0GvDnAUCXlSGtJrAYs8L6yFZvAbcpuvLNBQHNH4MM="
SECRET_NAME = "PRO_LICENSE_V2_ED25519_PRIVATE"
ROOT = Path.cwd()  # Allows safe standalone script outside a locally diverged repository


def extract_key(record: dict, password: str) -> bytes:
    """Return DER PKCS8 in memory only, after strict envelope and public-key checks."""
    if record.get("format") != "humperdinck-pro-signing-key-backup-v1" or record.get("key_id") != KEY_ID:
        raise ValueError("Expected the encrypted owner v2 signing backup")
    if record.get("cipher") != "AES-256-GCM":
        raise ValueError("Unexpected encryption format")
    kdf = record.get("kdf")
    if not isinstance(kdf, dict) or (kdf.get("name"), kdf.get("n"), kdf.get("r"), kdf.get("p")) != ("scrypt", 32768, 8, 1):
        raise ValueError("Unsupported encrypted backup parameters")
    def dec(key: str, source: dict = record) -> bytes:
        return base64.b64decode(source[key], validate=True)
    try:
        salt = dec("salt_base64", kdf)
        nonce = dec("nonce_base64")
        encrypted = dec("private_pkcs8_ciphertext_base64")
        public = dec("public_key_base64")
        expected = base64.b64decode(PINNED_PUBLIC, validate=True)
        if public != expected or len(public) != 32 or len(salt) != 32 or len(nonce) != 12:
            raise ValueError("Backup public key or format does not match pinned application key")
        if len(encrypted) > 4096:
            raise ValueError("Unexpectedly large encrypted private key")
        derived = Scrypt(salt=salt, length=32, n=32768, r=8, p=1).derive(password.encode("utf8"))
        plaintext = AESGCM(derived).decrypt(nonce, encrypted, KEY_ID.encode("utf8"))
        signing_key = serialization.load_der_private_key(plaintext, password=None)
        if not isinstance(signing_key, Ed25519PrivateKey):
            raise ValueError("Backup did not contain an Ed25519 key")
        recovered = signing_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw)
        if recovered != expected:
            raise ValueError("Recovered signing key does not match pinned public key")
        return plaintext
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Could not recover v2 signer; backup may be wrong or corrupted") from exc
    except Exception as exc:
        raise ValueError("Could not recover v2 signer; check the passphrase and encrypted backup") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", required=True, type=Path)
    parser.add_argument("--worker", default="humperdinck", help="Existing Cloudflare Worker script name")
    parser.add_argument("--wrangler", default="npx", help="Path to Node npx (defaults to npx wrangler)")
    args = parser.parse_args()
    path = args.backup.expanduser()
    if not path.is_file() or path.stat().st_size > 65536:
        parser.error("Encrypted signing backup not found or unexpectedly large")
    if not (ROOT / "wrangler.jsonc").is_file():
        parser.error("Run this tool from the Humperdinck repository root (wrangler.jsonc)")
    if not shutil.which(args.wrangler):
        parser.error("npx not found; install Node.js and log into Cloudflare with Wrangler")
    print(f"This will stage {SECRET_NAME} on the existing Cloudflare Worker {args.worker}.")
    print("This DOES NOT activate v2, change v1, issue a license, or accept payments.")
    if input(f"Type STAGE {args.worker} to continue: ").strip() != f"STAGE {args.worker}":
        print("Cancelled without changes")
        return 1
    password = getpass.getpass("Local encrypted backup passphrase (not echoed): ")
    try:
        record = json.loads(path.read_text(encoding="utf8"))
        der = extract_key(record, password)
    except (ValueError, OSError) as exc:
        print("Local verification failed:", exc, file=sys.stderr)
        return 2
    finally:
        del password
    # Cloudflare Worker uses the BASE64-encoded DER PKCS8, not PEM or hex.
    # The sensitive value is supplied only via stdin, NEVER command line/env/logs.
    cmd = [args.wrangler, "wrangler", "secret", "put", SECRET_NAME,
           "--name", args.worker]
    try:
        completed = subprocess.run(
            cmd, input=base64.b64encode(der) + b"\n", cwd=ROOT,
            capture_output=True, timeout=120, check=False
        )
    except (OSError, subprocess.TimeoutExpired):
        print("Wrangler did not finish; verify Cloudflare secret state before retrying",
              file=sys.stderr)
        return 3
    finally:
        del der
    if completed.returncode != 0:
        # Wrangler output can echo secret material in certain failures: do not display!
        print("Cloudflare rejected the staging request; verify Wrangler authentication and Worker name.", file=sys.stderr)
        return 4
    print("v2 private signing key staged as a Cloudflare secret (not yet active).")
    print("v1 still signs until the separate activation step is explicitly performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
