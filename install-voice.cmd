@echo off
rem Double-click to install the Qwen custom voice cloning engine.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Double-click install.cmd first.
  pause
  exit /b 1
)
.venv\Scripts\python.exe scripts\install_voice.py
echo.
pause
