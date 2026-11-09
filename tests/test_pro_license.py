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
    assert one['installation_id'][-6:] in one['label']
    assert len(one['installation_id'])==36
    third=pro_license.installation(tmp_path/'another')
    assert third['installation_id']!=one['installation_id']
    if os.name=='posix':
        assert (tmp_path/'installation.json').stat().st_mode & 0o077 == 0

def test_future_v2_key_validates_offline_without_invalidating_v1(tmp_path,monkeypatch):
    """No v2 private key or public key is shipped before the owner's migration."""
    v1=make_grant(monkeypatch)
    v1_public=pro_license.PRO_PUBLIC_KEY_BASE64
    old_id=pro_license.PRO_KEY_ID
    v2_private=Ed25519PrivateKey.generate()
    v2_public=base64.b64encode(v2_private.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )).decode()
    grant={'version':1,'type':pro_license.LICENSE_TYPE,
           'key_id':pro_license.PRO_V2_KEY_ID,
           'license_id':str(uuid4()),'subject':str(uuid4()),
           'issued_at':int(time.time()),'features':['pro'],
           'transfer':'portable-offline-backup','expires_at':None}
    payload=json.dumps(grant,separators=(',',':')).encode()
    encode=lambda data:base64.urlsafe_b64encode(data).decode().rstrip('=')
    token=encode(payload)+'.'+encode(v2_private.sign(payload))
    with pytest.raises(pro_license.InvalidLicense):
        pro_license.verify(token)
    monkeypatch.setattr(pro_license,'PRO_V2_PUBLIC_KEY_BASE64',v2_public)
    assert pro_license.verify(token)['key_id']==pro_license.PRO_V2_KEY_ID
    assert pro_license.verify(v1)['key_id']==old_id
    assert pro_license.save(tmp_path,token)['plan']=='pro'
    assert pro_license.backup(tmp_path)['license']==token
    assert pro_license.status(tmp_path)['active']
    assert pro_license.PRO_PUBLIC_KEY_BASE64==v1_public


def test_unrecognized_key_id_and_modified_payload_are_rejected(monkeypatch):
    token=make_grant(monkeypatch)
    body,signature=token.split('.')
    payload=json.loads(base64.urlsafe_b64decode(body+'='*(-len(body)%4)))
    payload['key_id']='humperdinck-pro-ed25519-v999'
    altered=base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
    with pytest.raises(pro_license.InvalidLicense):
        pro_license.verify(altered+'.'+signature)

def test_simulated_v2_activation_then_v1_rollback_keeps_both_offline(tmp_path,monkeypatch):
    """Switching the server's issuer cannot invalidate either pinned public key."""
    keys={}
    for version in (1,2):
        private=Ed25519PrivateKey.generate()
        public=base64.b64encode(private.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw)).decode()
        keys[version]=(private,public)
    monkeypatch.setattr(pro_license,'PRO_PUBLIC_KEY_BASE64',keys[1][1])
    monkeypatch.setattr(pro_license,'PRO_V2_PUBLIC_KEY_BASE64',keys[2][1])
    encode=lambda b:base64.urlsafe_b64encode(b).decode().rstrip('=')

    def issue(version):
        grant={'version':1,'type':pro_license.LICENSE_TYPE,
               'key_id':f'humperdinck-pro-ed25519-v{version}',
               'license_id':str(uuid4()),'subject':str(uuid4()),
               'issued_at':int(time.time()),'features':['pro'],
               'transfer':'portable-offline-backup','expires_at':None}
        payload=json.dumps(grant,separators=(',',':')).encode()
        return encode(payload)+'.'+encode(keys[version][0].sign(payload))

    earlier=issue(1)
    after_activation=issue(2)
    after_rollback=issue(1)
    for folder,token in [('before',earlier),('v2',after_activation),('rollback',after_rollback)]:
        directory=tmp_path/folder
        assert pro_license.save(directory,token)['active'] is True
        assert pro_license.backup(directory)['license']==token
        assert pro_license.status(directory)['active']
        assert pro_license.verify(token)['key_id'].startswith('humperdinck-pro-ed25519-v')
    # The older client lacks v2: it still accepts v1 certificates, while a
    # current dual-verifier accepts all three without needing the Worker.
    monkeypatch.setattr(pro_license,'PRO_V2_PUBLIC_KEY_BASE64',None)
    assert pro_license.verify(earlier)['key_id']==pro_license.PRO_KEY_ID
    with pytest.raises(pro_license.InvalidLicense):
        pro_license.verify(after_activation)
    monkeypatch.setattr(pro_license,'PRO_V2_PUBLIC_KEY_BASE64',keys[2][1])
    assert pro_license.verify(after_activation)['key_id']==pro_license.PRO_V2_KEY_ID
    assert pro_license.verify(after_rollback)['key_id']==pro_license.PRO_KEY_ID
