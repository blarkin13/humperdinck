@echo off
rem Double-click to install Humperdinck on Windows.
setlocal
cd /d "%~dp0"
echo Installing Humperdinck...
echo.
where winget >nul 2>&1 && set "HAS_WINGET=1"

rem The voice engines need Python 3.11 or 3.12; newer versions are not supported by them yet.
call :find_python
if defined PY goto have_python
if not defined HAS_WINGET goto no_python
echo Python 3.11 or 3.12 was not found. Installing Python 3.11 for your user account.
echo Any other Python versions on this PC are left alone.
winget install -e --id Python.Python.3.11 --scope user --accept-package-agreements --accept-source-agreements
call :find_python
if defined PY goto have_python
:no_python
echo.
echo Python 3.11 or 3.12 is required. Install Python 3.12 from https://www.python.org/downloads/
echo and tick "Add python.exe to PATH", then double-click install.cmd again.
goto done

:have_python
echo Using Python: %PY%
set "PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Microsoft\WinGet\Links"
where npm >nul 2>&1 || call :winget_install OpenJS.NodeJS.LTS "Node.js"
where ffmpeg >nul 2>&1 || call :winget_install Gyan.FFmpeg "FFmpeg"
echo.
"%PY%" scripts\install.py
if errorlevel 1 (echo. & echo Install did not finish. See the messages above.)
goto done

:find_python
set "PY="
for %%V in (3.12 3.11) do if not defined PY for /f "delims=" %%P in ('py -%%V -c "import sys; print(sys.executable)" 2^>nul') do set "PY=%%P"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
exit /b

:winget_install
if not defined HAS_WINGET (echo %~2 is missing. Install it, then run install.cmd again. & exit /b)
echo Installing %~2...
winget install -e --id %1 --accept-package-agreements --accept-source-agreements
set "PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Microsoft\WinGet\Links"
exit /b

:done
echo.
pause
