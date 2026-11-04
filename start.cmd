@echo off
rem Double-click to open Humperdinck.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Humperdinck is not installed yet. Double-click install.cmd first.
  pause
  exit /b 1
)
.venv\Scripts\python.exe scripts\start.py
echo.
pause
