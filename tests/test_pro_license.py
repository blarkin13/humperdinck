"""Portable perpetual Pro identity: only signed grants unlock features offline."""
import base64
import json
import os
import time
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend import entitlements, pro_license


def make_grant(monkeypatch):
    private=Ed25519PrivateKey.generate()
    pub=private.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    monkeypatch.setattr(pro_license, 'PRO_PUBLIC_KEY_BASE64',base64.b64encode(pub).decode())
    grant={
        'version':1,'type':'humperdinck.pro.perpetual',
        'key_id':'humperdinck-pro-ed25519-v1',
        'license_id':str(uuid4()),'subject':str(uuid4()),'issued_at':int(time.time()),
        'features':['pro'],'transfer':'portable-offline-backup','expires_at':None,
    }
    payload=json.dumps(grant,separators=(',',':')).encode()
    encode=lambda b:base64.urlsafe_b64encode(b).decode().rstrip('=')
    return encode(payload)+'.'+encode(private.sign(payload))


def test_signed_pro_works_without_account_and_survives_reinstallation(tmp_path, monkeypatch):
    monkeypatch.setenv('HUMPERDINCK_DATA',str(tmp_path))
    monkeypatch.delenv('HUMPERDINCK_ENABLE_DEV_ENTITLEMENTS',raising=False)
    monkeypatch.delenv('HUMPERDINCK_DEV_PRO',raising=False)
    monkeypatch.setenv('HUMPERDINCK_NATIVE_PACKAGE','1')
    assert entitlements.status()['plan']=='free'
    token=make_grant(monkeypatch)
    saved=pro_license.save(tmp_path,token)
    assert saved['plan']=='pro' and saved['lifetime']
    status=entitlements.status()
    assert status['plan']=='pro'
    assert status['license_activated']
    assert not status['development_preview']
    assert status['capabilities']['voice.custom_qwen_design']
    backup=pro_license.backup(tmp_path)
    assert backup['license']==token
    # Portable restore without login/Cloudflare. Identifiers are installation-
    # generated, not serial numbers or machine fingerprints.
    restored=tmp_path/'another-installation'
    assert pro_license.save(restored,backup['license'])['plan']=='pro'
    assert pro_license.status(restored)['active']
    assert not (restored/'account-session.json').exists()


def test_tampering_and_malformed_backup_cannot_unlock_pro(tmp_path,monkeypatch):
    monkeypatch.setenv('HUMPERDINCK_DATA',str(tmp_path))
    monkeypatch.delenv('HUMPERDINCK_ENABLE_DEV_ENTITLEMENTS',raising=False)
    monkeypatch.delenv('HUMPERDINCK_DEV_PRO',raising=False)
    token=make_grant(monkeypatch)
    with pytest.raises(pro_license.InvalidLicense):
        pro_license.verify(token[:-1]+'!')
    with pytest.raises(pro_license.InvalidLicense):
        pro_license.verify(token.split('.')[0]+'.'+'A'*86)
    with pytest.raises(pro_license.InvalidLicense):
        pro_license.save(tmp_path,'invalid-license-text')
    assert entitlements.status()['plan']=='free'
    (tmp_path/'pro-license.json').write_text(json.dumps({'license':'fake'}))
    assert entitlements.status()['plan']=='free'


def test_installation_id_random_and_stable(tmp_path):
    one=pro_license.installation(tmp_path)
    two=pro_license.installation(tmp_path)
    assert one==two
    assert one['label']=='Humperdinck desktop'
    assert len(one['installation_id'])==36
    third=pro_license.installation(tmp_path/'another')
    assert third['installation_id']!=one['installation_id']
    if os.name=='posix':
        assert (tmp_path/'installation.json').stat().st_mode & 0o077 == 0
