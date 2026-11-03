$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
py -3.11 scripts/install.py
if ($LASTEXITCODE -ne 0) { Write-Host 'Try: python scripts/install.py' }
