"""Update Humperdinck from the main branch on GitHub.

1. check(): fetch the latest commit on main and compare GitHub's git blob hashes
   with the files on disk (timestamps and line endings don't matter).
2. stage(): download the repository snapshot at exactly that commit and verify
   every file against the hashes from step 1.
3. apply(): back up the files that will change, replace them, and remove files
   that were deleted upstream. Only after the user approves.

Only application code is managed. data/ (voices, recordings, outputs, databases),
the virtual environments, node_modules and git metadata are never touched.
Uses only the standard library so it works before dependencies are installed.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = os.environ.get('HUMPERDINCK_UPDATE_REPO', 'blarkin13/humperdinck')
BRANCH = 'main'
API = 'https://api.github.com'
STATE = ROOT / '.update'            # staged download, backups, dependency marker
MAX_ARCHIVE = 50 * 1024 * 1024
MAX_FILES = 2000

# Folders whose files the updater manages, plus individual top-level files.
MANAGED_DIRS = ('backend/', 'frontend/', 'scripts/', 'tests/', 'docs/')
MANAGED_TOP = re.compile(r'[^/]+\.(sh|ps1|bat|cmd|md|txt)|\.gitignore')
# Never replaced or deleted, even inside a managed folder.
PROTECTED = re.compile(r'(^|/)(__pycache__|node_modules|\.pytest_cache)(/|$)|^frontend/dist/|\.pyc$|(^|/)\.DS_Store$')
REQUIRED = {'backend/app.py', 'backend/updater.py', 'frontend/src.jsx', 'scripts/start.py', 'start.sh'}
# Changing these means dependencies must be reinstalled before the next start.
DEPENDENCY_FILES = {'backend/requirements.txt', 'frontend/package.json'}


class UpdateError(Exception):
    pass


def managed(path: str) -> bool:
    if PROTECTED.search(path) or '..' in path.split('/') or path.startswith('/'):
        return False
    return path.startswith(MANAGED_DIRS) or ('/' not in path and bool(MANAGED_TOP.fullmatch(path)))


def blob_hash(raw: bytes) -> str:
    """Git's blob digest, so local files compare directly against GitHub's tree."""
    return hashlib.sha1(b'blob %d\0' % len(raw) + raw).hexdigest()


def normalize(raw: bytes) -> bytes:
    # Text checked out on Windows may use CRLF; git stores LF.
    return raw if b'\0' in raw else raw.replace(b'\r\n', b'\n')


def local_hash(path: str) -> str | None:
    file = ROOT / path
    return blob_hash(file.read_bytes()) if file.is_file() else None


def local_matches(path: str, expected_sha: str) -> bool:
    """Compare local file bytes to GitHub's blob.

    Some committed Windows batch files have CRLF line endings, while other
    files are committed with LF and checked out as CRLF on Windows.
    Check the exact bytes first, then allow normalization of a local CRLF
    checkout against a remotely stored LF blob. Always normalizing was wrong:
    it made remotely committed CRLF .cmd files look perpetually modified.
    """
    file = ROOT / path
    if not file.is_file():
        return False
    raw = file.read_bytes()
    return blob_hash(raw) == expected_sha or blob_hash(normalize(raw)) == expected_sha


def local_files() -> set[str]:
    found = set()
    for folder in MANAGED_DIRS:
        base = ROOT / folder
        if base.is_dir():
            for file in base.rglob('*'):
                rel = file.relative_to(ROOT).as_posix()
                if file.is_file() and not file.is_symlink() and managed(rel):
                    found.add(rel)
    found |= {f.name for f in ROOT.iterdir() if f.is_file() and managed(f.name)}
    return found


_token = None


def token() -> str:
    """A GitHub token for private repositories: env var first, else the gh CLI login."""
    global _token
    if _token is None:
        _token = os.environ.get('HUMPERDINCK_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN') or ''
        if not _token and shutil.which('gh'):
            try:
                _token = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True, timeout=5).stdout.strip()
            except (OSError, subprocess.TimeoutExpired):
                _token = ''
    return _token


def headers() -> dict:
    result = {'Accept': 'application/vnd.github+json', 'User-Agent': 'Humperdinck-Updater', 'X-GitHub-Api-Version': '2022-11-28'}
    if token():
        result['Authorization'] = f'Bearer {token()}'
    return result


def github_json(path: str) -> dict:
    request = urllib.request.Request(f'{API}/repos/{REPO}/{path}', headers=headers())
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise UpdateError(f'GitHub repository {REPO} was not found (or is private)') from exc
        if exc.code == 403:
            raise UpdateError('GitHub rate limit reached; try again later') from exc
        raise UpdateError(f'GitHub returned HTTP {exc.code}') from exc
    except (OSError, ValueError) as exc:
        raise UpdateError('Could not reach GitHub (offline?)') from exc


def check() -> dict:
    commit = github_json(f'commits/{BRANCH}')
    sha = commit.get('sha', '')
    tree_sha = ((commit.get('commit') or {}).get('tree') or {}).get('sha', '')
    if not re.fullmatch(r'[0-9a-f]{40}', sha) or not re.fullmatch(r'[0-9a-f]{40}', tree_sha):
        raise UpdateError('GitHub returned an invalid commit')
    tree = github_json(f'git/trees/{tree_sha}?recursive=1')
    if tree.get('truncated'):
        raise UpdateError('GitHub returned an incomplete file list')
    remote = {e['path']: e['sha'] for e in tree.get('tree', [])
              if e.get('type') == 'blob' and managed(e.get('path', '')) and re.fullmatch(r'[0-9a-f]{40}', e.get('sha', ''))}
    if len(remote) > MAX_FILES:
        raise UpdateError('Update has an unexpected number of files')
    missing = sorted(REQUIRED - remote.keys())
    if missing:
        raise UpdateError('GitHub main is missing required files: ' + ', '.join(missing))
    changed = sorted(p for p, digest in remote.items() if not local_matches(p, digest))
    removed = sorted(local_files() - remote.keys())
    message = (commit.get('commit') or {}).get('message', '').splitlines()
    return {'available': bool(changed or removed), 'commit_sha': sha, 'latest': sha[:8],
            'summary': message[0][:200] if message else '',
            'date': ((commit.get('commit') or {}).get('committer') or {}).get('date', ''),
            'changed_files': changed, 'removed_files': removed, 'file_hashes': remote,
            'url': f'https://github.com/{REPO}/commit/{sha}',
            'reason': '' if changed or removed else 'Up to date with GitHub main'}


def download(sha: str, target: Path):
    request = urllib.request.Request(f'{API}/repos/{REPO}/zipball/{sha}', headers=headers())
    try:
        with urllib.request.urlopen(request, timeout=30) as response, target.open('wb') as out:
            size = 0
            while chunk := response.read(1 << 20):
                size += len(chunk)
                if size > MAX_ARCHIVE:
                    raise UpdateError('Update download is unexpectedly large')
                out.write(chunk)
    except (OSError, urllib.error.URLError) as exc:
        raise UpdateError('Could not download the update') from exc


def read_archive(archive: Path) -> dict[str, bytes]:
    """Return managed files from a GitHub zipball, rejecting unsafe entries."""
    owner_prefix = REPO.split('/')[0].lower() + '-'
    files = {}
    try:
        with zipfile.ZipFile(archive) as z:
            entries = [i for i in z.infolist() if not i.is_dir()]
            if not entries or len(entries) > MAX_FILES:
                raise UpdateError('Update archive has an unexpected file count')
            for info in entries:
                parts = info.filename.split('/')
                if '\\' in info.filename or info.filename.startswith('/') or '..' in parts or '\0' in info.filename:
                    raise UpdateError('Unsafe path in update archive')
                if (info.external_attr >> 16) & 0o170000 == 0o120000:
                    raise UpdateError('Update archive contains a symbolic link')
                if len(parts) < 2 or not parts[0].lower().startswith(owner_prefix):
                    raise UpdateError('Unexpected update archive layout')
                name = '/'.join(parts[1:])
                if not managed(name):
                    continue
                if info.file_size > MAX_ARCHIVE or name in files:
                    raise UpdateError('Invalid file in update archive: ' + name)
                files[name] = z.read(info)
    except zipfile.BadZipFile as exc:
        raise UpdateError('Downloaded update is not a valid archive') from exc
    return files


def stage(update: dict) -> Path:
    """Download the snapshot at the checked commit and verify every file's hash."""
    sha = update.get('commit_sha', '')
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise UpdateError('Invalid commit')
    STATE.mkdir(exist_ok=True)
    archive = STATE / 'update.zip'
    try:
        download(sha, archive)
        files = read_archive(archive)
        expected = update['file_hashes']
        if set(files) != set(expected):
            raise UpdateError('Downloaded files do not match the file list from GitHub')
        for name, digest in expected.items():
            if blob_hash(files[name]) != digest:
                raise UpdateError(f'Checksum mismatch for {name}')
        (STATE / 'update.json').write_text(json.dumps(update))
        return archive
    except Exception:
        archive.unlink(missing_ok=True)
        raise


def staged() -> dict | None:
    try:
        return json.loads((STATE / 'update.json').read_text()) if (STATE / 'update.zip').is_file() else None
    except (OSError, ValueError):
        return None


def apply() -> dict:
    """Install the staged update. Call only while the app's servers are stopped."""
    update = staged()
    if not update:
        raise UpdateError('No downloaded update to install')
    archive = STATE / 'update.zip'
    files = read_archive(archive)
    for name, digest in update['file_hashes'].items():  # re-verify after the restart
        if blob_hash(files.get(name, b'')) != digest:
            raise UpdateError(f'Checksum mismatch for {name}; update not installed')
    backup = STATE / 'backups' / time.strftime('%Y%m%d-%H%M%S')
    changed = [n for n in sorted(files) if not local_matches(n, update['file_hashes'][n])]
    removed = sorted(local_files() - files.keys())
    done = []
    try:
        for name in changed + removed:
            target = ROOT / name
            if target.is_file():
                (backup / name).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup / name)
            if name in files:
                target.parent.mkdir(parents=True, exist_ok=True)
                temp = target.with_name(target.name + '.update-tmp')
                temp.write_bytes(files[name])
                if target.is_file():
                    shutil.copymode(target, temp)
                elif name.endswith('.sh'):
                    temp.chmod(0o755)
                os.replace(temp, target)
            else:
                target.unlink()
            done.append(name)
    except Exception:
        # Put back everything already touched so the app is never half-updated.
        for name in done:
            saved = backup / name
            if saved.is_file():
                shutil.copy2(saved, ROOT / name)
            elif name in files:
                (ROOT / name).unlink(missing_ok=True)
        raise
    finally:
        archive.unlink(missing_ok=True)
        (STATE / 'update.json').unlink(missing_ok=True)
    deps = sorted(DEPENDENCY_FILES & set(changed))
    if deps:
        (STATE / 'reinstall').write_text('\n'.join(deps))
    (STATE / 'installed.json').write_text(json.dumps({'commit_sha': update['commit_sha'], 'installed_at': time.time()}))
    return {'changed_files': changed, 'removed_files': removed, 'backup': str(backup), 'reinstall': deps}


def installed_commit() -> str | None:
    try:
        return json.loads((STATE / 'installed.json').read_text())['commit_sha']
    except (OSError, ValueError, KeyError):
        return None
