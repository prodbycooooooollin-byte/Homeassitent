# Startet Lanelab: lädt Modlock bei Bedarf selbst herunter und öffnet das Spiel.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path $here '.modlock'
$exe = Join-Path $tools 'modlock.exe'

try {
  if (-not (Test-Path $exe)) {
    Write-Host 'Lade Modlock herunter (nur beim ersten Start)...'
    New-Item -ItemType Directory -Force -Path $tools | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/paralin/modlock/releases/latest' -Headers @{ 'User-Agent' = 'lanelab' }
    $asset = $release.assets | Where-Object { $_.name -match 'windows' -and $_.name -match '\.(exe|zip)$' } | Select-Object -First 1
    if (-not $asset) { throw 'Keine Windows-Datei im neuesten Modlock-Release gefunden: https://github.com/paralin/modlock/releases' }
    $file = Join-Path $tools $asset.name
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file -UseBasicParsing
    if ($asset.name -match '\.zip$') {
      Expand-Archive -Path $file -DestinationPath $tools -Force
      $found = Get-ChildItem -Path $tools -Recurse -Filter 'modlock*.exe' | Where-Object { $_.Name -notmatch 'host' } | Select-Object -First 1
      if (-not $found) { throw 'modlock.exe nicht im Download gefunden.' }
      if ($found.FullName -ne $exe) { Copy-Item $found.FullName $exe -Force }
    } else {
      Move-Item $file $exe -Force
    }
  }
  Set-Location $here
  Write-Host 'Starte Lanelab. Beim ersten Mal lädt Modlock den Server, das dauert einen Moment.'
  & $exe dev
} catch {
  Write-Host ''
  Write-Host "Fehler: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Schick mir diese Meldung, dann helfe ich weiter.'
  Read-Host 'Enter zum Schließen'
}
