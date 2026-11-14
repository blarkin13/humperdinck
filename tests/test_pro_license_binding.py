"""Pro certificates bound to the purchasing account and to one computer."""
import base64
import json
import time
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend import account_client, pro_license

OWNER = str(uuid4())
HERE = 'b' * 64


@pytest.fixture
def signer(monkeypatch):
    private = Ed25519PrivateKey.generate()
    pub = private.public_key().public_bytes(encoding=serialization.Encoding.Raw,
                                            format=serialization.PublicFormat.Raw)
    monkeypatch.setattr(pro_license, 'PRO_PUBLIC_KEY_BASE64', base64.b64encode(pub).decode())
    monkeypatch.setattr(pro_license, '_DEVICE_HASH', HERE)

    def sign(version=2, device=HERE, subject=OWNER, **extra):
        grant = {'version': version, 'type': 'humperdinck.pro.perpetual',
                 'key_id': 'humperdinck-pro-ed25519-v1', 'license_id': str(uuid4()),
                 'subject': subject, 'issued_at': int(time.time()), 'features': ['pro'],
                 'expires_at': None,
                 'transfer': 'account-device-bound' if version == 2 else 'portable-offline-backup'}
        if version == 2:
            grant['device_hash'] = device
        grant.update(extra)
        payload = json.dumps(grant).encode()
        enc = lambda b: base64.urlsafe_b64encode(b).decode().rstrip('=')
        return enc(payload) + '.' + enc(private.sign(payload))
    return sign


def sign_in(folder, user_id):
    (folder / 'account-session.json').write_text(json.dumps(
        {'token': 't' * 43, 'user': {'id': user_id}, 'expires_at': int(time.time()) + 3600}))


def test_bound_license_works_offline_on_its_computer(tmp_path, signer):
    pro_license.save(tmp_path, signer())
    assert pro_license.status(tmp_path)['active']          # signed out, offline
    sign_in(tmp_path, OWNER)
    assert pro_license.status(tmp_path)['active']          # owner signed in


def test_copied_bound_license_does_nothing_on_another_computer(tmp_path, signer, monkeypatch):
    token = signer(device='c' * 64)
    with pytest.raises(pro_license.InvalidLicense):
        pro_license.save(tmp_path, token)
    # Even if the file is copied in directly, it stays Free.
    (tmp_path / 'pro-license.json').write_text(json.dumps({'license': token}))
    status = pro_license.status(tmp_path)
    assert not status['active'] and status['inactive_reason'] == 'other_computer'


def test_other_account_signed_in_shows_free_for_bound_and_older_licenses(tmp_path, signer):
    for token in (signer(), signer(version=1)):
        (tmp_path / 'pro-license.json').write_text(json.dumps({'license': token}))
        sign_in(tmp_path, str(uuid4()))
        status = pro_license.status(tmp_path)
        assert not status['active'] and status['inactive_reason'] == 'other_account'
        sign_in(tmp_path, OWNER)
        assert pro_license.status(tmp_path)['active']


def test_older_unbound_license_keeps_working_and_is_flagged_for_upgrade(tmp_path, signer):
    pro_license.save(tmp_path, signer(version=1))
    assert pro_license.status(tmp_path)['active']
    assert pro_license.needs_upgrade(tmp_path)
    pro_license.save(tmp_path, signer())
    assert not pro_license.needs_upgrade(tmp_path)


def test_bound_license_needs_a_valid_computer_hash(signer):
    for bad in ('B' * 64, 'b' * 63, None):
        with pytest.raises(pro_license.InvalidLicense):
            pro_license.verify(signer(device=bad))
    with pytest.raises(pro_license.InvalidLicense):
        pro_license.verify(signer(transfer='portable-offline-backup'))


def test_device_hash_never_contains_raw_id_and_slot_id_is_stable(tmp_path, monkeypatch):
    monkeypatch.setattr(pro_license, '_DEVICE_HASH', None)
    monkeypatch.setattr(pro_license, '_machine_id', lambda: 'RAW-MACHINE-ID-1234')
    value = pro_license.device_hash(tmp_path)
    assert len(value) == 64 and 'raw-machine' not in value.lower()
    slot = pro_license.device_installation_id(tmp_path)
    assert slot == pro_license.device_installation_id(tmp_path / 'reinstall')
    # No OS id available: falls back to this installation's random id.
    monkeypatch.setattr(pro_license, '_DEVICE_HASH', None)
    monkeypatch.setattr(pro_license, '_machine_id', lambda: None)
    assert len(pro_license.device_hash(tmp_path)) == 64


def test_startup_upgrade_swaps_older_license_for_bound_one(tmp_path, signer, monkeypatch):
    pro_license.save(tmp_path, signer(version=1))
    sign_in(tmp_path, OWNER)
    sent = {}

    def fake_call(path, payload=None, token=None):
        if path == 'license':
            return {'plan': 'pro'}
        if path == 'license/activate':
            sent.update(payload)
            return {'activated': True, 'license': signer(), 'active_devices': 1, 'device_limit': 10}
        raise AssertionError(path)
    monkeypatch.setattr(account_client, '_call', fake_call)
    assert account_client.upgrade_license(tmp_path)
    assert sent['device_hash'] == HERE and len(sent['installation_id']) == 36
    assert not pro_license.needs_upgrade(tmp_path)
    assert not account_client.upgrade_license(tmp_path)     # nothing left to do


def test_startup_upgrade_offline_keeps_older_license(tmp_path, signer, monkeypatch):
    pro_license.save(tmp_path, signer(version=1))
    sign_in(tmp_path, OWNER)

    def offline(*args, **kwargs):
        raise account_client.HTTPException(503, 'offline')
    monkeypatch.setattr(account_client, '_call', offline)
    assert not account_client.upgrade_license(tmp_path)
    assert pro_license.status(tmp_path)['active']
