@echo off
rem Double-click to install the Chatterbox narration voice engine.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Double-click install.cmd first.
  pause
  exit /b 1
)
.venv\Scripts\python.exe scripts\install_voice.py
echo.
pause
