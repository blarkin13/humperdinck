"""Deterministic sampling seeds so one voice sounds the same everywhere.

Qwen samples its speech tokens at random. Unseeded, the same line in the same
voice came out different on every call (measured: different audio and length),
so a preview, a Narration Studio section and an export of the same text did not
match, and re-rendering a project changed it. Seeding each chunk from the voice
identity and the chunk text makes identical requests produce identical audio.
"""
import hashlib
from pathlib import Path


def file_digest(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def clone_identity(reference, transcript=None):
    """A cloned voice is its recording bytes plus the transcript used with it."""
    return 'clone:' + file_digest(reference) + ':' + (transcript or '').strip()


def design_identity(description):
    return 'design:' + ' '.join(str(description).split())


def seed_for(identity, text):
    """A 32-bit seed from the voice identity and the exact chunk text."""
    material = identity + '\n' + ' '.join(str(text).split())
    return int(hashlib.sha256(material.encode('utf-8')).hexdigest()[:8], 16)
