Set-Location $PSScriptRoot
if (-not (Test-Path .venv\Scripts\python.exe)) { Write-Host 'Humperdinck is not installed yet. Double-click install.cmd first.' -ForegroundColor Red; exit 1 }
# Use Humperdinck's own Python; piping through Out-Host keeps its output in the launcher's log.
.venv\Scripts\python.exe scripts/start.py 2>&1 | Out-Host
