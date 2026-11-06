param([Parameter(Mandatory=$true)][string]$CertificateBase64,[Parameter(Mandatory=$true)][string]$CertificatePassword)
$ErrorActionPreference='Stop'
$pfx=Join-Path $env:RUNNER_TEMP 'humperdinck-signing.pfx'
try {
 [IO.File]::WriteAllBytes($pfx,[Convert]::FromBase64String($CertificateBase64))
 $pass=ConvertTo-SecureString $CertificatePassword -AsPlainText -Force
 $cert=Import-PfxCertificate -FilePath $pfx -CertStoreLocation 'Cert:\CurrentUser\My' -Password $pass
 if (-not $cert -or -not $cert.HasPrivateKey) { throw 'Signing certificate/private key missing' }
 $eku=$cert.EnhancedKeyUsageList | Where-Object { $_.ObjectId -eq '1.3.6.1.5.5.7.3.3' }
 if (-not $eku) { throw 'Certificate does not allow code signing' }
 $thumb=$cert.Thumbprint
 "WINDOWS_SIGNING_THUMBPRINT=$thumb" | Out-File -FilePath $env:GITHUB_ENV -Append
 $config=@{ bundle=@{ windows=@{ certificateThumbprint=$thumb; digestAlgorithm='sha256'; timestampUrl='http://timestamp.digicert.com' } } } | ConvertTo-Json -Depth 4 -Compress
 Set-Content 'desktop/src-tauri/signing.windows.json' -Value $config
 $bin='desktop/src-tauri/binaries/humperdinck-server-x86_64-pc-windows-msvc.exe'
 if (-not (Test-Path $bin)) { throw "Server missing: $bin" }
 $signtool=Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe | Where-Object {$_.FullName.EndsWith('\x64\signtool.exe')} | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
 if (-not $signtool) { throw 'Windows SDK signtool missing' }
 # The engine folder's unsigned DLLs and .pyd files must be signed too, or Smart App Control blocks them at launch.
 $files=@($bin)+@(Get-ChildItem 'desktop/src-tauri/binaries/humperdinck-engine' -Recurse -Include *.exe,*.dll,*.pyd | ForEach-Object {
  if ((Get-AuthenticodeSignature $_.FullName).Status -ne 'Valid') { $_.FullName } })
 foreach ($file in $files) {
  & $signtool sign /sha $thumb /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $file
  if ($LASTEXITCODE -ne 0) { throw "Failed to sign $file" }
 }
 & $signtool verify /pa /v $bin
 if ($LASTEXITCODE -ne 0) { throw 'Python sidecar signature verification failed' }
} finally {
 Remove-Item $pfx -ErrorAction SilentlyContinue
}
