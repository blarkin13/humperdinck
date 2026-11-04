$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
# Files from a browser download are marked as coming from the internet; clear that so the scripts run.
Get-ChildItem -Recurse -Include *.ps1,*.cmd,*.py | Unblock-File -ErrorAction SilentlyContinue
if (Get-Command py -ErrorAction SilentlyContinue) { py -3.11 scripts/install.py }
elseif (Get-Command python -ErrorAction SilentlyContinue) { python scripts/install.py }
else { Write-Host 'Python 3.11 was not found. Install it from https://www.python.org/downloads/ (tick "Add python.exe to PATH") and run this again.'; exit 1 }
if ($LASTEXITCODE -ne 0) { Write-Host 'Install did not finish. Try: python scripts/install.py'; exit $LASTEXITCODE }
