#!/usr/bin/env python3
"""Start Humperdinck: check GitHub for updates, then run the API and UI servers.

The in-app "Check updates" button stages a verified download and asks this launcher
to restart (via .update/restart). The launcher stops the servers, installs the
update, and restarts itself in the same terminal.
"""
import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
from backend import updater  # noqa: E402  (stdlib only, safe before dependencies)
from backend.shared_models import import_legacy_presets, configure_hf_home  # noqa: E402

py = root/'.venv'/('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
npm = 'npm.cmd' if sys.platform == 'win32' else 'npm'
if not py.exists():
    sys.exit('Run scripts/install.py first')


def say(message):
    print(f'[Humperdinck] {message}', flush=True)


def restart(note):
    say(note)
    os.environ['HUMPERDINCK_SKIP_STARTUP_UPDATE'] = '1'
    os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve())])


def install_staged():
    try:
        result = updater.apply()
    except updater.UpdateError as exc:
        say(f'Update failed: {exc}. Starting the installed version.')
        return False
    say(f"Installed {len(result['changed_files'])} changed and {len(result['removed_files'])} removed files. "
        f"Backup: {result['backup']}")
    return True


def reinstall_dependencies():
    marker = updater.STATE/'reinstall'
    if not marker.exists():
        return
    changed = marker.read_text().split()
    if 'backend/requirements.txt' in changed:
        say('Updating Python dependencies...')
        subprocess.run([str(py), '-m', 'pip', 'install', '-q', '-r', str(root/'backend/requirements.txt')], check=True)
    if 'frontend/package.json' in changed:
        say('Updating interface dependencies...')
        subprocess.run([npm, 'install', '--no-audit', '--no-fund'], cwd=root/'frontend', check=True)
    marker.unlink()


def check_on_launch():
    if os.environ.get('HUMPERDINCK_SKIP_STARTUP_UPDATE') == '1':
        return
    say(f'Checking GitHub ({updater.REPO}, {updater.BRANCH}) for updates...')
    try:
        update = updater.check()
    except updater.UpdateError as exc:
        say(f'Update check unavailable: {exc}. Starting the installed version.')
        return
    if not update['available']:
        say(update['reason'])
        return
    say(f"Update available: {update['latest']} {update['summary']}")
    files = update['changed_files'] + [f + ' (removed)' for f in update['removed_files']]
    for name in files[:30]:
        print('    ' + name)
    if len(files) > 30:
        print(f'    ...and {len(files) - 30} more')
    if not sys.stdin.isatty():
        say('Not an interactive terminal: use Check updates in the app to install.')
        return
    try:
        answer = input('Download and install this update now? [y/N]: ').strip().lower()
    except (EOFError, KeyboardInterrupt):
        answer = ''
    if answer not in ('y', 'yes'):
        say('Starting the installed version.')
        return
    try:
        updater.stage(update)
    except updater.UpdateError as exc:
        say(f'Update failed: {exc}. Starting the installed version.')
        return
    if install_staged():
        restart('Relaunching the updated application...')


def ensure_backend_packages():
    # Catches installs that predate a new requirement (e.g. code pulled with git but install not rerun).
    probe = 'import fastapi, uvicorn, multipart, pydantic, soundfile, numpy'
    if subprocess.run([str(py), '-c', probe], capture_output=True).returncode == 0:
        return
    say('Installing missing Python packages...')
    subprocess.run([str(py), '-m', 'pip', 'install', '-q', '-r', str(root/'backend/requirements.txt')], check=True)


reinstall_dependencies()
ensure_backend_packages()
check_on_launch()
# Preserve existing browser installs: copy old presets to the per-user shared
# model cache before bootstrap can attempt to download them again.
configure_hf_home()
try:
    imported = import_legacy_presets(root / 'data')
    if imported:
        say(f'Imported {len(imported)} preset model file(s) into shared model storage.')
except OSError as exc:
    say(f'Existing preset model migration could not finish: {exc}')
# New and upgraded installs receive CPU narration voices automatically once.
# Never prevent the app from opening when first-time downloads are unavailable.
if os.environ.get('HUMPERDINCK_SKIP_PRESET_BOOTSTRAP') != '1':
    try:
        subprocess.run([str(py), str(root/'scripts/bootstrap_presets.py')], check=True)
    except subprocess.CalledProcessError:
        say('Built-in voice setup could not finish; retry on next launch or use Models to install voices.')
restart_flag = updater.STATE/'restart'
restart_flag.unlink(missing_ok=True)
env = dict(os.environ, HUMPERDINCK_LAUNCHER_PID=str(os.getpid()))
processes = []
try:
    processes.append(subprocess.Popen([str(py), '-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8000'], cwd=root, env=env))
    processes.append(subprocess.Popen([npm, 'run', 'dev'], cwd=root/'frontend', env=env))
    if os.environ.get('HUMPERDINCK_RELAUNCHED') != '1':
        time.sleep(2)
        webbrowser.open('http://127.0.0.1:5173')  # after an in-app update the page reloads itself
    say('Running at http://127.0.0.1:5173 — Ctrl+C to stop')
    while all(p.poll() is None for p in processes):
        if restart_flag.exists():
            break
        time.sleep(1)
finally:
    for p in processes:
        p.terminate()
    for p in processes:
        try:
            p.wait(timeout=15)
        except subprocess.TimeoutExpired:
            p.kill()

if restart_flag.exists():
    restart_flag.unlink()
    os.environ['HUMPERDINCK_RELAUNCHED'] = '1'
    if updater.staged():
        install_staged()
    restart('Restarting...')
