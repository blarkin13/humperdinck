@echo off
rem Double-click to run install-voice.ps1. Windows blocks downloaded PowerShell scripts by default;
rem this runs it for this one launch only and does not change any system setting.
cd /d "%~dp0"
echo Humperdinck: running install-voice ...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Transcript -Path \"$PWD\install-voice.log\" | Out-Null; try { & \".\install-voice.ps1\" %* } catch { Write-Host $_ -ForegroundColor Red }; Stop-Transcript | Out-Null"
echo.
echo Finished. A copy of everything above is saved in install-voice.log
pause
