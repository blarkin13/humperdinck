Set-Location $PSScriptRoot
if (-not (Get-Command python -ErrorAction SilentlyContinue) -and -not (Get-Command py -ErrorAction SilentlyContinue)) {
  Write-Host 'Python was not found. Install Python 3.11 from https://www.python.org/downloads/ (tick "Add python.exe to PATH"), then run install.cmd.' -ForegroundColor Red; exit 1 }
if (-not (Test-Path .venv\Scripts\python.exe)) { Write-Host 'Humperdinck is not installed yet. Double-click install.cmd first.' -ForegroundColor Red; exit 1 }
# Piping through Out-Host keeps Python's output in the launcher's log.
python scripts/start.py 2>&1 | Out-Host
