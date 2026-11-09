#!/usr/bin/env bash
# Humperdinck Voice Publisher: create and edit the Built-In Humperdinck Voices
# and the Voice Gallery. Nothing else. Run from the developer copy.
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  echo 'Run bash install.sh first to create the project environment.' >&2
  exit 1
fi
exec .venv/bin/python scripts/voice_publisher_app.py
