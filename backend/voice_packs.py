"""Switches for Built-In Humperdinck Voices and the Voice Gallery.

ENABLED: the app shows the Voice Gallery and keeps built-in voices current
from humperdinck.studio/voices/ (the Voice Publisher's Publish button).

BUNDLED: the desktop installer also carries a built-in voice pack. Off: the
pinned pack in the build is the old seven voices, so new installs get the
current built-in voices from the website on first launch instead.
"""
ENABLED = True
BUNDLED = False
