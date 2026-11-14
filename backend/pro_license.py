"""Verify permanent Humperdinck Pro certificates offline.

New certificates (version 2) are bound to the purchasing account and to this
computer: they carry a salted SHA-256 of the computer's own ID (macOS hardware
UUID, Windows MachineGuid, Linux machine-id), never the raw ID. Once activated
they work offline with no sign-in. A copied certificate does nothing on another
computer, and no certificate unlocks Pro while a different account is signed in.

Older version 1 certificates (issued before binding) keep working on the
computer that has them, and are replaced by a bound certificate the next time
this computer is signed in to the owning account.
"""
from __future__ import annotations

import base64
import binascii
import json
import os
from pathlib import Path
import hashlib
import secrets
import subprocess
import sys
import time
from uuid import UUID, uuid4

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

PRO_KEY_ID = 'humperdinck-pro-ed25519-v1'
PRO_PUBLIC_KEY_BASE64 = 'YIYroSRZsiMKFXj7PL3i/YX847sGx9muPqIY0r15JTQ='
# Trusted offline verification key ring. V1 must remain pinned forever.
# Owner-generated v2 PUBLIC key (safe to ship). Private signing key is never embedded.
PRO_V2_PUBLIC_KEY_BASE64 = 'LJ0GvDnAUCXlSGtJrAYs8L6yFZvAbcpuvLNBQHNH4MM='
PRO_V2_KEY_ID = 'humperdinck-pro-ed25519-v2'
LICENSE_FILE = 'pro-license.json'
INSTALLATION_FILE = 'installation.json'
LICENSE_TYPE = 'humperdinck.pro.perpetual'
BETA_LICENSE_TYPE = 'humperdinck.pro.beta'
BETA_LICENSE_FILE = 'beta-license.json'


BOUND_TRANSFER = 'account-device-bound'
DEVICE_SALT = b'humperdinck-pro-device-v1:'


class InvalidLicense(ValueError):
    pass


def _is_hash(value) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


def _machine_id() -> str | None:
    """The operating system's own ID for this computer, read locally only."""
    try:
        if sys.platform == 'darwin':
            out = subprocess.run(['/usr/sbin/ioreg', '-rd1', '-c', 'IOPlatformExpertDevice'],
                                 capture_output=True, text=True, timeout=5).stdout
            for line in out.splitlines():
                if 'IOPlatformUUID' in line:
                    return line.split('=', 1)[1].strip().strip('"')
        elif sys.platform == 'win32':
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Cryptography', 0,
                                winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as key:
                return str(winreg.QueryValueEx(key, 'MachineGuid')[0])
        else:
            for path in ('/etc/machine-id', '/var/lib/dbus/machine-id'):
                try:
                    value = Path(path).read_text().strip()
                    if value:
                        return value
                except OSError:
                    pass
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        pass
    return None


_DEVICE_HASH: str | None = None


def device_hash(data: Path) -> str:
    """Salted SHA-256 of this computer's ID; the raw ID never leaves this function.

    If the operating system gives no ID, this installation's random ID is used,
    so Pro still activates (bound to this installation instead).
    """
    global _DEVICE_HASH
    if _DEVICE_HASH is None:
        raw = _machine_id()
        if raw:
            _DEVICE_HASH = hashlib.sha256(DEVICE_SALT + raw.strip().lower().encode()).hexdigest()
    if _DEVICE_HASH:
        return _DEVICE_HASH
    return hashlib.sha256(DEVICE_SALT + b'installation:' + installation(data)['installation_id'].encode()).hexdigest()


def device_installation_id(data: Path) -> str:
    """Stable per-computer slot ID, so reinstalling reuses the same device slot."""
    digest = hashlib.sha256(b'humperdinck-pro-slot-v1:' + device_hash(data).encode()).digest()
    return str(UUID(bytes=digest[:16], version=5))


def device_label(data: Path) -> str:
    """Account-page name for this computer, the same for every install on it."""
    os_name = {'darwin': 'Mac', 'win32': 'Windows'}.get(sys.platform, 'Linux')
    return f'{os_name} · {device_installation_id(data)[-6:]}'


def signed_in_user(data: Path) -> str | None:
    try:
        state = json.loads((Path(data) / 'account-session.json').read_text(encoding='utf-8'))
        user = state.get('user') or {}
        return user.get('id') if isinstance(user.get('id'), str) else None
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def binding_problem(data: Path, info: dict) -> str | None:
    """Why a valid certificate does not unlock Pro here, or None."""
    if info.get('version') == 2 and info.get('device_hash') != device_hash(data):
        return 'other_computer'
    user = signed_in_user(data)
    if user and user.lower() != str(info.get('subject', '')).lower():
        return 'other_account'
    return None


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
    bound = info.get('version') == 2
    if bound and (info.get('transfer') != BOUND_TRANSFER or not _is_hash(info.get('device_hash'))):
        raise InvalidLicense('License does not grant perpetual Humperdinck Pro')
    if (info.get('version') not in (1, 2) or
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


def verify_beta(token: str, installation_id: str, *, at: int | None = None) -> dict:
    """Beta cannot pass perpetual verification; it expires even when offline."""
    if not isinstance(token, str) or len(token) > 10000 or token.count('.') != 1:
        raise InvalidLicense('Invalid beta license format')
    body, sig = token.split('.')
    try:
        encoded, signature = _unbase64url(body), _unbase64url(sig)
        info = json.loads(encoded)
        if not isinstance(info, dict) or len(signature) != 64:
            raise InvalidLicense('Malformed beta certificate')
        key_id = info.get('key_id')
        keys = {PRO_KEY_ID: PRO_PUBLIC_KEY_BASE64, PRO_V2_KEY_ID: PRO_V2_PUBLIC_KEY_BASE64}
        pinned = keys.get(key_id)
        if not pinned:
            raise InvalidLicense('Unknown beta signing key')
        Ed25519PublicKey.from_public_bytes(base64.b64decode(pinned, validate=True)).verify(signature, encoded)
        now = int(time.time()) if at is None else int(at)
        if (info.get('version') != 1 or info.get('type') != BETA_LICENSE_TYPE or
            info.get('features') != ['pro'] or info.get('lifetime') is not False or
            info.get('transfer') != 'single-installation-expiring' or
            type(info.get('issued_at')) is not int or type(info.get('expires_at')) is not int or
            not (0 < info['issued_at'] <= now < info['expires_at'] <= info['issued_at'] + 30*86400) or
            info.get('installation_id') != installation_id or
            not isinstance(info.get('subject'), str) or
            not isinstance(info.get('license_id'), str)):
            raise InvalidLicense('Beta Pro certificate expired or invalid')
        UUID(info['subject']); UUID(info['license_id'])
        return info
    except (InvalidSignature, ValueError, TypeError, KeyError, UnicodeError, binascii.Error) as exc:
        raise InvalidLicense('Beta Pro certificate expired or invalid') from exc


def beta_certificate(data: Path) -> dict | None:
    try:
        stored = json.loads((Path(data) / BETA_LICENSE_FILE).read_text(encoding='utf-8'))
        # Read-only: no network request is needed to verify the signed expiration.
        identity = installation(data)['installation_id']
        return verify_beta(stored['license'], identity)
    except (OSError, ValueError, KeyError, TypeError):
        return None


def save_beta(data: Path, token: str) -> dict:
    identity = installation(data)['installation_id']
    info = verify_beta(token, identity)
    folder = Path(data)
    folder.mkdir(parents=True, exist_ok=True)
    temp = folder / ('.beta-license-' + secrets.token_hex(8))
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump({'format':'humperdinck-beta-v1', 'license':token}, f)
        os.replace(temp, folder / BETA_LICENSE_FILE)
    finally:
        temp.unlink(missing_ok=True)
    return {'plan':'pro','active':True,'lifetime':False,'beta':True,
            'expires_at':info['expires_at'],'license_id':info['license_id']}


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
    problem = binding_problem(data, verify(token)) if token else None
    if token is None or problem:
        beta = beta_certificate(data)
        if beta and binding_problem(data, beta) == 'other_account':
            beta = None
        if beta:
            return {'plan':'pro','active':True,'offline':True,'beta':True,
                    'lifetime':False,'perpetual':False,'portable_backup':False,
                    'expires_at':beta['expires_at'], 'license_id':beta['license_id']}
        result = {'plan': 'free', 'active': False, 'offline': True}
        if problem:
            result['inactive_reason'] = problem
        return result
    info = verify(token)
    return {'plan': 'pro', 'active': True, 'offline': True, 'lifetime': True,
            'license_id': info['license_id'], 'issued_at': info['issued_at'],
            'bound': info['version'] == 2, 'portable_backup': info['version'] == 1}


def needs_upgrade(data: Path) -> bool:
    """True when this computer has no bound certificate yet."""
    token = certificate(data)
    return token is None or verify(token)['version'] != 2


def save(data: Path, token: str) -> dict:
    info = verify(token)
    if info['version'] == 2 and info['device_hash'] != device_hash(data):
        raise InvalidLicense('This license was activated for a different computer')
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
