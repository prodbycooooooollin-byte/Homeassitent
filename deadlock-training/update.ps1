# Update and rebuild the trainer in one go.
#   .\update.ps1            -> git pull + build (the running server hot-reloads the plugin DLL)
#   .\update.ps1 -Restart   -> additionally restarts deadworks.exe (needed when heroes/precache changed)
param([switch]$Restart)

$ErrorActionPreference = "Stop"
$DeadlockDir = "C:\Program Files (x86)\Steam\steamapps\common\Deadlock"
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "== git pull ==" -ForegroundColor Cyan
git -C $repoRoot pull
if ($LASTEXITCODE -ne 0) { Write-Host "git pull failed (is github.com reachable?)" -ForegroundColor Red; exit 1 }

Write-Host "== build ==" -ForegroundColor Cyan
Push-Location $PSScriptRoot
dotnet build -c Release
$ok = ($LASTEXITCODE -eq 0)
Pop-Location
if (-not $ok) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

if ($Restart) {
    Write-Host "== restarting the server ==" -ForegroundColor Cyan
    Get-Process deadworks -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    $bin = Join-Path $DeadlockDir "game\bin\win64"
    Start-Process -FilePath (Join-Path $bin "deadworks.exe") -WorkingDirectory $bin
    Write-Host "Server starting. Wait for '0/31 on map dl_midtown', then: connect localhost:27067" -ForegroundColor Green
} else {
    Write-Host "Done. The running server reloads the plugin by itself; if nothing changes, run again with -Restart." -ForegroundColor Green
}
