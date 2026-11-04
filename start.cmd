@echo off
rem Double-click to run start.ps1. Windows blocks downloaded PowerShell scripts by default;
rem this runs it for this one launch only and does not change any system setting.
cd /d "%~dp0"
echo Humperdinck: running start ...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Transcript -Path \"$PWD\start.log\" | Out-Null; try { & \".\start.ps1\" %* } catch { Write-Host $_ -ForegroundColor Red }; Stop-Transcript | Out-Null"
echo.
echo Finished. A copy of everything above is saved in start.log
pause
