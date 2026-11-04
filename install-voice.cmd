@echo off
rem Double-click to run install-voice.ps1. Windows blocks downloaded PowerShell scripts by default;
rem this runs it for this one launch only and does not change any system setting.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-voice.ps1" %*
if errorlevel 1 pause
