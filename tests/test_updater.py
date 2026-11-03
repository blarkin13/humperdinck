"""Updater tests against a fake GitHub serving a modified copy of the project."""
import zipfile

import pytest

from backend import updater

SHA, TREE = 'a' * 40, 'b' * 40


@pytest.fixture
def project(tmp_path, monkeypatch):
    """An installed copy (local) and a newer upstream version (remote)."""
    local = tmp_path / 'local'
    files = {'backend/app.py': b'old app\n', 'backend/updater.py': b'u\n', 'frontend/src.jsx': b'ui\n',
             'scripts/start.py': b's\n', 'start.sh': b'#!/bin/sh\n', 'backend/gone.py': b'removed upstream\n',
             'backend/requirements.txt': b'fastapi\n'}
    for name, raw in files.items():
        (local / name).parent.mkdir(parents=True, exist_ok=True)
        (local / name).write_bytes(raw)
    (local / 'start.sh').chmod(0o755)
    # Things the updater must never touch.
    for keep in ('data/voice_library.sqlite3', 'data/voices/me.wav', '.venv/bin/python', 'frontend/node_modules/x.js'):
        (local / keep).parent.mkdir(parents=True, exist_ok=True)
        (local / keep).write_bytes(b'keep')
    remote = {**files, 'backend/app.py': b'new app\n', 'backend/new.py': b'added\n', 'backend/requirements.txt': b'fastapi\nhttpx\n'}
    del remote['backend/gone.py']
    monkeypatch.setattr(updater, 'ROOT', local)
    monkeypatch.setattr(updater, 'STATE', local / '.update')
    monkeypatch.setattr(updater, 'REPO', 'blarkin13/voice-studio-starter')
    state = {'archive': dict(remote)}

    def fake_json(path):
        if path == 'commits/main':
            return {'sha': SHA, 'commit': {'tree': {'sha': TREE}, 'message': 'Add new feature\n\nDetails',
                                           'committer': {'date': '2026-11-03T00:00:00Z'}}}
        assert path == f'git/trees/{TREE}?recursive=1'
        tree = [{'path': p, 'type': 'blob', 'sha': updater.blob_hash(raw)} for p, raw in remote.items()]
        return {'tree': tree + [{'path': 'data/x.db', 'type': 'blob', 'sha': 'c' * 40}], 'truncated': False}

    def fake_download(sha, target):
        assert sha == SHA
        with zipfile.ZipFile(target, 'w') as z:
            for name, raw in state['archive'].items():
                z.writestr(f'blarkin13-voice-studio-starter-aaaaaaa/{name}', raw)

    monkeypatch.setattr(updater, 'github_json', fake_json)
    monkeypatch.setattr(updater, 'download', fake_download)
    return local, state


def test_check_lists_changed_added_and_removed_files(project):
    update = updater.check()
    assert update['available'] and update['latest'] == SHA[:8] and update['summary'] == 'Add new feature'
    assert update['changed_files'] == ['backend/app.py', 'backend/new.py', 'backend/requirements.txt']
    assert update['removed_files'] == ['backend/gone.py']
    assert 'data/x.db' not in update['file_hashes']


def test_crlf_files_match(project):
    local, _ = project
    (local / 'frontend/src.jsx').write_bytes(b'ui\r\n')
    assert 'frontend/src.jsx' not in updater.check()['changed_files']


def test_stage_and_apply_preserves_data(project):
    local, _ = project
    updater.stage(updater.check())
    result = updater.apply()
    assert (local / 'backend/app.py').read_bytes() == b'new app\n'
    assert (local / 'backend/new.py').read_bytes() == b'added\n'
    assert not (local / 'backend/gone.py').exists()
    for keep in ('data/voice_library.sqlite3', 'data/voices/me.wav', '.venv/bin/python', 'frontend/node_modules/x.js'):
        assert (local / keep).read_bytes() == b'keep'
    assert (local / 'start.sh').stat().st_mode & 0o111
    backup = local / '.update' / 'backups'
    assert next(backup.rglob('app.py')).read_bytes() == b'old app\n'
    assert next(backup.rglob('gone.py')).exists()
    assert result['reinstall'] == ['backend/requirements.txt']
    assert (local / '.update/reinstall').read_text() == 'backend/requirements.txt'
    assert not updater.check()['available']


def test_tampered_download_is_rejected_and_nothing_changes(project):
    local, state = project
    state['archive']['backend/app.py'] = b'malicious\n'
    with pytest.raises(updater.UpdateError, match='Checksum mismatch'):
        updater.stage(updater.check())
    assert (local / 'backend/app.py').read_bytes() == b'old app\n'
    assert updater.staged() is None


def test_unsafe_archive_paths_are_rejected(project, tmp_path):
    bad = tmp_path / 'bad.zip'
    with zipfile.ZipFile(bad, 'w') as z:
        z.writestr('blarkin13-voice-studio-starter-a/../../evil.py', b'x')
    with pytest.raises(updater.UpdateError, match='Unsafe'):
        updater.read_archive(bad)


def test_managed_paths():
    assert updater.managed('backend/app.py') and updater.managed('start.sh') and updater.managed('README.md')
    for path in ('data/voice_library.sqlite3', '.venv/bin/python', 'frontend/node_modules/a.js',
                 'backend/__pycache__/a.pyc', 'frontend/dist/index.html', '.git/config', 'secrets.env', '../x.py'):
        assert not updater.managed(path), path
