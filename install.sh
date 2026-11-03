#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Prefer an existing compatible Python; otherwise use uv to provision an isolated one.
for candidate in python3.12 python3.11 python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; assert (3,11) <= sys.version_info[:2] < (3,13)' 2>/dev/null; then
    echo "Using $($candidate --version) from $(command -v "$candidate")"
    exec "$candidate" scripts/install.py
  fi
done

echo 'No Python 3.11/3.12 found; provisioning Python 3.11 using uv.'
if ! command -v uv >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo 'Installing uv using Homebrew...'
    brew install uv
  else
    echo 'Install uv first from https://docs.astral.sh/uv/getting-started/installation/'
    echo 'Then rerun bash install.sh. (No system Python changes required.)'
    exit 1
  fi
fi
uv python install 3.11
PYTHON_PATH="$(uv python find 3.11)"
"$PYTHON_PATH" scripts/install.py
