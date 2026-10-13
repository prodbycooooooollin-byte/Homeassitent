# Startet Lanelab: lädt Modlock bei Bedarf selbst herunter und öffnet das Spiel.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# Ein Deadlock-Ordner ist gültig, wenn der Server dort liegt.
function Test-Deadlock($dir) {
  return ($dir -and (Test-Path (Join-Path $dir 'game\citadel\bin\win64\server.dll')))
}

# Sucht Deadlock in allen Steam-Bibliotheken.
function Find-Deadlock {
  $roots = @()
  foreach ($key in 'HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam') {
    try {
      $v = (Get-ItemProperty $key -ErrorAction Stop)
      if ($v.SteamPath) { $roots += $v.SteamPath }
      if ($v.InstallPath) { $roots += $v.InstallPath }
    } catch {}
  }
  $roots += 'C:\Program Files (x86)\Steam', 'C:\Program Files\Steam'
  $libs = @()
  foreach ($r in $roots | Select-Object -Unique) {
    $libs += $r
    $vdf = Join-Path $r 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) {
      foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"')) { $libs += ($m.Groups[1].Value.Replace('\\', '\')) }
    }
  }
  foreach ($d in 'C','D','E','F','G') { $libs += "${d}:\SteamLibrary" }
  foreach ($l in $libs | Select-Object -Unique) {
    $c = Join-Path $l 'steamapps\common\Deadlock'
    if (Test-Deadlock $c) { return $c }
  }
  return $null
}
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
  # Eine falsch gesetzte Variable DEADLOCK_DIR überschreiben wir mit dem echten Ordner.
  if (-not (Test-Deadlock $env:DEADLOCK_DIR)) {
    if ($env:DEADLOCK_DIR) { Write-Host "Die Variable DEADLOCK_DIR zeigt auf '$($env:DEADLOCK_DIR)', dort liegt kein Deadlock. Suche selbst..." }
    $found = Find-Deadlock
    if (-not $found) { throw 'Deadlock wurde nicht gefunden. Ist es über Steam installiert? Starte es einmal und versuche es erneut.' }
    $env:DEADLOCK_DIR = $found
  }
  Write-Host "Deadlock gefunden: $($env:DEADLOCK_DIR)"
  Set-Location $here
  Write-Host 'Starte Lanelab. Beim ersten Mal lädt Modlock den Server, das dauert einen Moment.'
  & $exe dev
} catch {
  Write-Host ''
  Write-Host "Fehler: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Schick mir diese Meldung, dann helfe ich weiter.'
  Read-Host 'Enter zum Schließen'
}
