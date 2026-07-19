$ErrorActionPreference = 'Stop'

$repository = 'Complexity-ML/labo-ai'
$asset = 'LABO-AI-Setup-x64-helper.exe'
$latestUrl = "https://github.com/$repository/releases/latest/download"
$installDirectory = Join-Path $env:LOCALAPPDATA 'LABO AI\setup'
$installPath = Join-Path $installDirectory 'labo-ai-setup.exe'
$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("labo-ai-setup-" + [guid]::NewGuid().ToString('N'))

try {
  New-Item -ItemType Directory -Force -Path $temporaryDirectory | Out-Null
  $downloadedHelper = Join-Path $temporaryDirectory $asset
  $downloadedDigest = "$downloadedHelper.sha256"

  Write-Host 'Downloading the latest verified LABO AI Setup...'
  Invoke-WebRequest -UseBasicParsing -Uri "$latestUrl/$asset" -OutFile $downloadedHelper
  Invoke-WebRequest -UseBasicParsing -Uri "$latestUrl/$asset.sha256" -OutFile $downloadedDigest

  $expectedDigest = ((Get-Content $downloadedDigest -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
  $actualDigest = (Get-FileHash $downloadedHelper -Algorithm SHA256).Hash.ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($expectedDigest) -or $actualDigest -ne $expectedDigest) {
    throw 'LABO AI Setup checksum verification failed. Nothing was installed.'
  }

  New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
  Copy-Item -Force $downloadedHelper "$installPath.next"
  Move-Item -Force "$installPath.next" $installPath

  Write-Host 'Verified. Opening LABO AI Setup...'
  Start-Process -FilePath $installPath -ArgumentList '--auto-install'
} finally {
  if (Test-Path $temporaryDirectory) {
    Remove-Item -Recurse -Force $temporaryDirectory
  }
}
