Set-Location $PSScriptRoot
if (-not (Test-Path .venv\Scripts\python.exe)) { Write-Host 'Run install.cmd first.' -ForegroundColor Red; exit 1 }
.venv\Scripts\python.exe scripts/install_voice.py 2>&1 | Out-Host
