@echo off
chcp 65001 >nul
set "LANELAB_HOME=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((Get-Content -Raw -LiteralPath '%~f0').Split([string[]]('::PS'+'BEGIN'),2,[StringSplitOptions]::None)[1]))"
pause
exit /b
::PSBEGIN
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

# ---- Einstellungen ----
$repo   = 'prodbycooooooollin-byte/Homeassitent'
$branch = 'claude/cool-gates-x0ulmj'   # nach dem Mergen hier 'main' eintragen
# -----------------------

$base  = $env:LANELAB_HOME.TrimEnd('\')
$app   = Join-Path $base 'app'
$cache = Join-Path $base '.cache'
$exe   = Join-Path $cache 'modlock.exe'
$tagFile = Join-Path $cache 'modlock.tag'
New-Item -ItemType Directory -Force -Path $cache | Out-Null

function Test-Deadlock($dir) {
  return ($dir -and (Test-Path (Join-Path $dir 'game\citadel\bin\win64\server.dll')))
}

function Find-Deadlock {
  $roots = @()
  foreach ($key in 'HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam') {
    try {
      $v = Get-ItemProperty $key -ErrorAction Stop
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
      foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"')) { $libs += $m.Groups[1].Value.Replace('\\', '\') }
    }
  }
  foreach ($d in 'C','D','E','F','G') { $libs += "${d}:\SteamLibrary" }
  foreach ($l in $libs | Select-Object -Unique) {
    $c = Join-Path $l 'steamapps\common\Deadlock'
    if (Test-Deadlock $c) { return $c }
  }
  return $null
}

try {
  # 1) Mod von GitHub aktualisieren
  Write-Host "Suche Updates fuer Lanelab ($branch)..."
  try {
    $zip = Join-Path $cache 'src.zip'
    $src = Join-Path $cache 'src'
    Invoke-WebRequest -Uri "https://github.com/$repo/archive/refs/heads/$branch.zip" -OutFile $zip -UseBasicParsing
    if (Test-Path $src) { Remove-Item $src -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $src -Force
    $mod = Get-ChildItem -Path $src -Directory | ForEach-Object { Join-Path $_.FullName 'lanelab' } | Where-Object { Test-Path (Join-Path $_ 'mod.json') } | Select-Object -First 1
    if (-not $mod) { throw "Im Branch '$branch' liegt kein Ordner 'lanelab'." }
    New-Item -ItemType Directory -Force -Path $app | Out-Null
    robocopy $mod $app /MIR /XD node_modules build .modlock /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Kopieren fehlgeschlagen (robocopy $LASTEXITCODE)" }
    Write-Host 'Lanelab ist aktuell.'
  } catch {
    if (-not (Test-Path (Join-Path $app 'mod.json'))) { throw "Konnte Lanelab nicht laden: $($_.Exception.Message)" }
    Write-Host "Update nicht moeglich ($($_.Exception.Message)). Starte die vorhandene Version." -ForegroundColor Yellow
  }

  # 2) Modlock aktualisieren (neue Spielversionen brauchen ein neues Modlock)
  try {
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/paralin/modlock/releases/latest' -Headers @{ 'User-Agent' = 'lanelab' }
    $have = if (Test-Path $tagFile) { (Get-Content $tagFile -Raw).Trim() } else { '' }
    if (-not (Test-Path $exe) -or $have -ne $release.tag_name) {
      $asset = $release.assets | Where-Object { $_.name -eq 'modlock-windows-amd64.exe' } | Select-Object -First 1
      if (-not $asset) { throw 'modlock-windows-amd64.exe fehlt im neuesten Modlock-Release.' }
      Write-Host "Lade Modlock $($release.tag_name)..."
      $tmp = "$exe.download"
      Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp -UseBasicParsing
      Move-Item $tmp $exe -Force
      Set-Content -Path $tagFile -Value $release.tag_name
    }
  } catch {
    if (-not (Test-Path $exe)) { throw "Konnte Modlock nicht laden: $($_.Exception.Message)" }
    Write-Host "Modlock-Update nicht moeglich. Starte die vorhandene Version." -ForegroundColor Yellow
  }

  # 3) Deadlock finden
  if (-not (Test-Deadlock $env:DEADLOCK_DIR)) {
    $found = Find-Deadlock
    if (-not $found) { throw 'Deadlock wurde nicht gefunden. Ist es ueber Steam installiert?' }
    $env:DEADLOCK_DIR = $found
  }
  Write-Host "Deadlock: $($env:DEADLOCK_DIR)"

  # 4) Starten
  Set-Location $app
  Write-Host 'Starte Lanelab. Beim ersten Mal laedt Modlock den Server, das dauert einen Moment.'
  & $exe dev
} catch {
  Write-Host ''
  Write-Host "Fehler: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Schick mir diese Meldung, dann helfe ich weiter.'
}
