#!/usr/bin/env python3
"""Generate a *new* versioned Pro license signing key with encrypted owner backup.

DO NOT upload this backup to GitHub, chats or public cloud storage.
This does NOT retrieve the existing (nonexportable) Cloudflare Worker secret,
replace its key, or activate a key in production. Keep v1 public verification
working for all already-issued lifetime licenses if/when rotating to v2.

Requires: python -m pip install cryptography
"""
from __future__ import annotations
import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import secrets
import stat

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode('ascii')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output',type=Path,required=True,help='Destination for encrypted private-key backup JSON; use a private location')
    ap.add_argument('--key-id',default='humperdinck-pro-ed25519-v2',
                    help='Version identifier (must be different from existing v1)')
    args=ap.parse_args()
    if args.key_id=='humperdinck-pro-ed25519-v1':
        ap.error('Do not overwrite the existing live v1 signing key')
    file=args.output.expanduser().resolve()
    file.parent.mkdir(parents=True,exist_ok=True)
    if file.exists():ap.error('Refusing to overwrite an existing backup file')
    password=getpass.getpass('New encryption passphrase (20+ characters): ')
    verify=getpass.getpass('Repeat passphrase: ')
    if password!=verify or len(password)<20:
        ap.error('Passphrases must match and be at least 20 characters')
    # scrypt + AES-256-GCM protects the private key; no unencrypted copy is written.
    salt=secrets.token_bytes(32)
    nonce=secrets.token_bytes(12)
    key=Scrypt(salt=salt,length=32,n=2**15,r=8,p=1).derive(password.encode('utf-8'))
    private=Ed25519PrivateKey.generate()
    plaintext=private.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    public=private.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    record={
      'format':'humperdinck-pro-signing-key-backup-v1',
      'key_id':args.key_id,
      'public_key_base64':b64(public),
      'cipher':'AES-256-GCM',
      'kdf':{'name':'scrypt','n':2**15,'r':8,'p':1,'salt_base64':b64(salt)},
      'nonce_base64':b64(nonce),
      'private_pkcs8_ciphertext_base64':b64(AESGCM(key).encrypt(nonce,plaintext,args.key_id.encode()))
    }
    flags=os.O_WRONLY|os.O_CREAT|os.O_EXCL
    fd=os.open(file,flags,0o600)
    try:
        with os.fdopen(fd,'w',encoding='utf8') as f:
            json.dump(record,f,indent=2)
            f.write('\n')
        if os.name=='posix':os.chmod(file,stat.S_IRUSR|stat.S_IWUSR)
    finally:
        del key
        del private
    print('Encrypted signing key backup created:',file)
    print('Key ID:',args.key_id)
    print('Public key, safe to copy into source:',b64(public))
    print('PRIVATE KEY WAS NOT PRINTED OR WRITTEN UNENCRYPTED.')
    print('Store the encrypted file and passphrase separately. Keep the existing v1 public key valid forever.')
    print('This key is NOT live and must not be deployed until verification and rotation are prepared.')


if __name__=='__main__':main()
