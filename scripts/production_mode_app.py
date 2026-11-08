"""The packaged app's startup steps, as an app uvicorn can reload (see start_production_mode.py).

Built-in voices arrive through the app's launch check (/api/builtin-voices/check),
the same way an installed app picks up voices published after its release.
"""
from backend import media_tools

media_tools.configure()

from backend.app import app  # noqa: E402,F401
