"""Optional cloud account connection. Never required for Free/local inference.

Desktop pairs through a short-lived browser approval (device-code) flow. The
private proof and resulting bearer token stay in the Python backend, not React.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import time
import urllib.error
import urllib.request
import webbrowser

from fastapi import HTTPException
from backend import pro_license

DEFAULT_ORIGIN = 'https://humperdinck.studio'
_pending: dict | None = None


def _origin() -> str:
    url = os.getenv('HUMPERDINCK_ACCOUNT_ORIGIN', DEFAULT_ORIGIN).rstrip('/')
    if not (url.startswith('https://') or url.startswith('http://127.0.0.1:') or url.startswith('http://localhost:')):
        raise ValueError('Account service must use HTTPS')
    return url


def _call(path: str, payload: dict | None = None, token: str | None = None) -> dict:
    headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(
        _origin() + '/api/account/' + path,
        headers=headers,
        data=json.dumps(payload).encode() if payload is not None else None,
        method='POST' if payload is not None else 'GET',
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read(64 * 1024))
    except urllib.error.HTTPError as exc:
        try:
            reason = json.loads(exc.read(4096)).get('error', 'Account service unavailable')
        except Exception:
            reason = 'Account service unavailable'
        raise HTTPException(exc.code if 400 <= exc.code < 600 else 503, reason) from exc
    except (TimeoutError, OSError, ValueError) as exc:
        raise HTTPException(503, 'Could not reach Humperdinck accounts. Free still works offline.') from exc


def _account_file(data: Path) -> Path:
    return Path(data) / 'account-session.json'


def status(data: Path) -> dict:
    path = _account_file(data)
    try:
        state = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(state, dict) or not isinstance(state.get('token'), str) or state.get('expires_at', 0) <= time.time():
            return {'connected': False}
        user = state.get('user') or {}
        return {'connected': True, 'user': {k: user.get(k) for k in ('id', 'email', 'display_name', 'providers')},
                'expires_at': state['expires_at']}
    except (OSError, ValueError, TypeError):
        return {'connected': False}


def _save(data: Path, state: dict) -> None:
    folder = Path(data)
    folder.mkdir(parents=True, exist_ok=True)
    path = _account_file(folder)
    temp = folder / ('.account-session-' + secrets.token_hex(8))
    try:
        # 0600 on POSIX; on Windows, file inherits user's AppData ACL.
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            json.dump(state, out)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def begin() -> dict:
    global _pending
    verifier = secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    result = _call('device/begin', {'challenge': challenge})
    request_id = result.get('request_id')
    verification_url = result.get('verification_url', '')
    if not isinstance(request_id, str) or len(request_id) != 43 or not verification_url.startswith(_origin() + '/account/?device='):
        raise HTTPException(503, 'Invalid account-service pairing response')
    _pending = {'request_id': request_id, 'verifier': verifier, 'expires_at': time.time()+min(result.get('expires_in', 600), 600)}
    # Use the system's external browser, not an embedded webview.
    browser_opened = webbrowser.open(verification_url)
    return {'pending': True, 'verification_url': verification_url, 'browser_opened': bool(browser_opened)}


def poll(data: Path) -> dict:
    global _pending
    pending = _pending
    if not pending:
        return {'pending': False, **status(data)}
    if time.time() >= pending['expires_at']:
        _pending = None
        return {'pending': False, 'expired': True, **status(data)}
    result = _call('device/poll', {'request_id': pending['request_id'], 'verifier': pending['verifier']})
    if result.get('status') != 'complete':
        return {'pending': True}
    token, user, expiry = result.get('access_token'), result.get('user'), result.get('expires_at')
    if not isinstance(token, str) or len(token) != 43 or not isinstance(user, dict) or not isinstance(expiry, int):
        raise HTTPException(503, 'Invalid completed account pairing')
    _save(data, {'token': token, 'user': user, 'expires_at': expiry})
    _pending = None
    # Customers who already own Pro automatically activate this installation.
    # An offline local license remains valid even if this request fails.
    try:
        overview = _call('license', token=token)
        if overview.get('plan') == 'pro':
            _activate_with_token(data, token)
    except HTTPException:
        pass
    return {'pending': False, **status(data)}


def disconnect(data: Path) -> dict:
    global _pending
    _pending = None
    path = _account_file(data)
    revoked = False
    try:
        state = json.loads(path.read_text(encoding='utf-8'))
        token = state.get('token')
        if token:
            try:
                _call('logout', {}, token=token)
                revoked = True
            except HTTPException:
                pass
    except (OSError, ValueError, TypeError):
        pass
    path.unlink(missing_ok=True)
    return {'connected': False, 'online_session_revoked': revoked,
            'message': 'Signed out of this device.' if revoked else
                       'Signed out locally. Online access may remain valid until its session expires.'}


def _connected_token(data: Path) -> str:
    try:
        state = json.loads(_account_file(data).read_text(encoding='utf-8'))
        if not isinstance(state.get('token'), str) or state.get('expires_at', 0) <= time.time():
            raise ValueError('Expired session')
        return state['token']
    except (OSError, TypeError, ValueError):
        raise HTTPException(401, 'Connect your Humperdinck account to activate Pro')


def _activate_with_token(data: Path, token: str) -> dict:
    info = pro_license.installation(data)
    result = _call('license/activate', info, token=token)
    certificate = result.get('license')
    if not isinstance(certificate, str):
        raise HTTPException(503, 'Account server did not supply a signed license')
    try:
        saved = pro_license.save(data, certificate)
    except pro_license.InvalidLicense as exc:
        raise HTTPException(503, 'Server license signature could not be verified') from exc
    return {'activated': True, 'license': saved,
            'active_devices': result.get('active_devices'),
            'device_limit': result.get('device_limit', 10),
            'warning': result.get('warning')}


def activate_pro(data: Path) -> dict:
    return _activate_with_token(data, _connected_token(data))
