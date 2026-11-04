Set-Location $PSScriptRoot
# Files from a browser download are marked as coming from the internet; clear that so the scripts run.
Get-ChildItem -Recurse -Include *.ps1,*.cmd,*.py -Exclude .venv* | Unblock-File -ErrorAction SilentlyContinue
$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }

# The voice engines need Python 3.11 or 3.12; newer versions are not supported by them yet.
function Find-Python {
  foreach ($v in '3.12','3.11') {
    if (Get-Command py -ErrorAction SilentlyContinue) {
      $exe = (& py "-$v" -c 'import sys; print(sys.executable)' 2>$null)
      if ($LASTEXITCODE -eq 0 -and $exe) { return $exe.Trim() }
    }
    $local = Join-Path $env:LOCALAPPDATA ("Programs\Python\Python" + $v.Replace('.','') + "\python.exe")
    if (Test-Path $local) { return $local }
  }
  return $null
}

$python = Find-Python
if (-not $python) {
  if (-not $hasWinget) { Write-Host 'Python 3.11 or 3.12 is required. Install Python 3.11 from https://www.python.org/downloads/release/python-3119/ (tick "Add python.exe to PATH"), then run install.cmd again.' -ForegroundColor Red; exit 1 }
  Write-Host 'Python 3.11 or 3.12 was not found. Installing Python 3.11 for your user (your other Python versions are left alone)...' -ForegroundColor Yellow
  winget install -e --id Python.Python.3.11 --scope user --accept-package-agreements --accept-source-agreements 2>&1 | Out-Host
  Refresh-Path
  $python = Find-Python
  if (-not $python) { Write-Host 'Python 3.11 did not install. Install it from https://www.python.org/downloads/release/python-3119/ and run install.cmd again.' -ForegroundColor Red; exit 1 }
}
Write-Host "Using Python: $python"

foreach ($tool in @(@('npm','OpenJS.NodeJS.LTS','Node.js'), @('ffmpeg','Gyan.FFmpeg','FFmpeg'))) {
  if (-not (Get-Command $tool[0] -ErrorAction SilentlyContinue)) {
    if ($hasWinget) { Write-Host "Installing $($tool[2])..." -ForegroundColor Yellow; winget install -e --id $tool[1] --accept-package-agreements --accept-source-agreements 2>&1 | Out-Host; Refresh-Path }
    else { Write-Host "$($tool[2]) is missing. Install it, then run install.cmd again." -ForegroundColor Red }
  }
}

& $python scripts/install.py 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Write-Host 'Install did not finish. See the messages above.' -ForegroundColor Red; exit $LASTEXITCODE }
