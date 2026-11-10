"""Signed temporary Pro grants: expiry, device binding, and non-perpetual isolation."""
import base64
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from backend import pro_license

def b64url(b):
    return base64.urlsafe_b64encode(b).decode().rstrip('=')

class BetaProTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name)
        self.device = pro_license.installation(self.data)['installation_id']
        self.key = Ed25519PrivateKey.generate()
        public = self.key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw)
        self.patcher=patch.object(pro_license, 'PRO_PUBLIC_KEY_BASE64',
                                  base64.b64encode(public).decode())
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        self.temp.cleanup()

    def sign(self, issued=None, expires=None, device=None, kind='humperdinck.pro.beta'):
        start = issued if issued is not None else int(time.time()) - 30
        end = expires if expires is not None else start + 30*86400
        body = json.dumps({'version':1, 'type':kind,
                           'key_id':pro_license.PRO_KEY_ID,
                           'license_id':str(uuid4()), 'subject':str(uuid4()),
                           'issued_at':start,'expires_at':end,
                           'features':['pro'],'lifetime':False,
                           'transfer':'single-installation-expiring',
                           'installation_id':device or self.device},
                          separators=(',',':')).encode()
        return b64url(body)+'.'+b64url(self.key.sign(body))

    def test_beta_entitlement_is_not_lifetime_and_no_portable_backup(self):
        self.assertFalse(pro_license.status(self.data)['active'])
        token = self.sign()
        saved = pro_license.save_beta(self.data,token)
        self.assertTrue(saved['beta'])
        result = pro_license.status(self.data)
        self.assertTrue(result['active'])
        self.assertFalse(result['lifetime'])
        self.assertFalse(result['portable_backup'])
        with self.assertRaises(pro_license.InvalidLicense):
            pro_license.verify(token)
        with self.assertRaises(pro_license.InvalidLicense):
            pro_license.backup(self.data)

    def test_expiry_and_other_machine_rejected(self):
        now=int(time.time())
        token=self.sign(issued=now-100,expires=now-1)
        with self.assertRaises(pro_license.InvalidLicense):
            pro_license.verify_beta(token,self.device,at=now)
        token=self.sign()
        with self.assertRaises(pro_license.InvalidLicense):
            pro_license.verify_beta(token,str(uuid4()))

    def test_longer_than_30_days_and_wrong_certificate_kind_rejected(self):
        start=int(time.time())-10
        with self.assertRaises(pro_license.InvalidLicense):
            pro_license.verify_beta(self.sign(issued=start,expires=start+31*86400),
                                    self.device)
        with self.assertRaises(pro_license.InvalidLicense):
            pro_license.verify_beta(self.sign(kind='humperdinck.pro.perpetual'),
                                    self.device)

    def test_expired_saved_license_returns_to_free(self):
        token=self.sign(issued=1000,expires=1000+30*86400)
        file=self.data / pro_license.BETA_LICENSE_FILE
        file.write_text(json.dumps({'license':token}))
        self.assertEqual(pro_license.status(self.data)['plan'],'free')

if __name__=='__main__':
    unittest.main()
