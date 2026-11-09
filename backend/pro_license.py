"""Verify permanent Humperdinck Pro certificates without network, login, or DRM.

Portable owner certificates intentionally work on a replacement installation
even when the company is gone. They are not bound to a hardware fingerprint.
This means a ten-device online-registration cap is not an offline copy lock.
"""
from __future__ import annotations

import base64
import binascii
import json
import os
from pathlib import Path
import secrets
import time
from uuid import UUID, uuid4

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

PRO_KEY_ID = 'humperdinck-pro-ed25519-v1'
PRO_PUBLIC_KEY_BASE64 = 'YIYroSRZsiMKFXj7PL3i/YX847sGx9muPqIY0r15JTQ='
# Trusted offline verification key ring. V1 must remain pinned forever.
# After the owner's local v2 key generation and recovery test, replace ONLY
# None with the public v2 Ed25519 key from the local script's output. NEVER
# place the private key in app source, shipped packages or GitHub.
PRO_V2_PUBLIC_KEY_BASE64 = None
PRO_V2_KEY_ID = 'humperdinck-pro-ed25519-v2'
LICENSE_FILE = 'pro-license.json'
INSTALLATION_FILE = 'installation.json'
LICENSE_TYPE = 'humperdinck.pro.perpetual'


class InvalidLicense(ValueError):
    pass


def _unbase64url(value: str) -> bytes:
    if not value or len(value) > 9000 or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_' for c in value):
        raise InvalidLicense('Invalid license encoding')
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


def verify(token: str) -> dict:
    """Verify signed, immutable grant. No locally editable Pro switch."""
    if not isinstance(token, str) or len(token) > 10000 or token.count('.') != 1:
        raise InvalidLicense('Invalid license format')
    body, sig = token.split('.')
    try:
        encoded = _unbase64url(body)
        signature = _unbase64url(sig)
        if len(signature) != 64:
            raise InvalidLicense('Invalid license signature length')
        # Parse the untrusted key ID only to choose from a strictly pinned
        # allowlist. Never use a key embedded in the token or from the network.
        info = json.loads(encoded)
        if not isinstance(info, dict):
            raise InvalidLicense('Malformed license payload')
        key_id = info.get('key_id')
        trusted_keys = {PRO_KEY_ID: PRO_PUBLIC_KEY_BASE64}
        if PRO_V2_PUBLIC_KEY_BASE64:
            trusted_keys[PRO_V2_KEY_ID] = PRO_V2_PUBLIC_KEY_BASE64
        pinned = trusted_keys.get(key_id) if isinstance(key_id, str) else None
        if pinned is None:
            raise InvalidLicense('Unknown or unconfigured signing key')
        public_bytes = base64.b64decode(pinned, validate=True)
        if len(public_bytes) != 32:
            raise InvalidLicense('Invalid pinned signing key')
        Ed25519PublicKey.from_public_bytes(public_bytes).verify(signature, encoded)
    except (InvalidSignature, ValueError, TypeError, KeyError, UnicodeError, binascii.Error) as exc:
        raise InvalidLicense('License signature is invalid') from exc
    if (info.get('version') != 1 or
        info.get('type') != LICENSE_TYPE or info.get('key_id') not in trusted_keys or
        info.get('expires_at', 'missing') is not None or
        info.get('features') != ['pro'] or
        not isinstance(info.get('issued_at'), int) or
        info['issued_at'] <= 0 or
        not isinstance(info.get('license_id'), str) or
        not isinstance(info.get('subject'), str)):
        raise InvalidLicense('License does not grant perpetual Humperdinck Pro')
    try:
        UUID(info['license_id'])
        UUID(info['subject'])
    except (ValueError, TypeError) as exc:
        raise InvalidLicense('Invalid license identity') from exc
    return info


def _path(data: Path) -> Path:
    return Path(data) / LICENSE_FILE


def certificate(data: Path) -> str | None:
    try:
        info = json.loads(_path(data).read_text(encoding='utf-8'))
        token = info['license']
        verify(token)
        return token
    except (OSError, ValueError, TypeError, KeyError):
        return None


def status(data: Path) -> dict:
    token = certificate(data)
    if token is None:
        return {'plan': 'free', 'active': False, 'offline': True}
    info = verify(token)
    return {'plan': 'pro', 'active': True, 'offline': True, 'lifetime': True,
            'license_id': info['license_id'], 'issued_at': info['issued_at'],
            'portable_backup': True}


def save(data: Path, token: str) -> dict:
    info = verify(token)
    folder = Path(data)
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / ('.pro-license-' + secrets.token_hex(8))
    try:
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump({'format': 'humperdinck-offline-v1', 'license': token}, f)
        os.replace(tmp, _path(data))
    finally:
        tmp.unlink(missing_ok=True)
    return {'plan': 'pro', 'active': True, 'lifetime': True,
            'license_id': info['license_id']}


def backup(data: Path) -> dict:
    token = certificate(data)
    if not token:
        raise InvalidLicense('No valid license is installed')
    return {'format': 'humperdinck-offline-v1', 'license': token}


def installation(data: Path) -> dict:
    path = Path(data) / INSTALLATION_FILE
    try:
        stored = json.loads(path.read_text(encoding='utf-8'))
        UUID(stored['installation_id'])
        if stored['installation_id'].lower() != str(UUID(stored['installation_id'])):
            raise ValueError('Noncanonical installation id')
        return {'installation_id': stored['installation_id'],
                'label': stored.get('label') or 'Humperdinck desktop'}
    except (OSError, ValueError, TypeError, KeyError):
        Path(data).mkdir(parents=True, exist_ok=True)
        # No hardware identifier or hostname is collected. Labels can be edited in the account.
        new_id = str(uuid4())
        os_name = {'Darwin': 'Mac', 'Windows': 'Windows', 'Linux': 'Linux'}.get(os.uname().sysname if hasattr(os, 'uname') else os.name, 'Desktop')
        info = {'installation_id': new_id, 'label': f'{os_name} · {new_id[-6:]}'}
        temp = Path(data) / ('.installation-' + secrets.token_hex(8))
        try:
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(info, f)
            os.replace(temp, path)
        finally:
            temp.unlink(missing_ok=True)
        return info
