# Builds the plugin and copies it into the Deadlock/Deadworks plugins folder.
# Usage:  .\build.ps1            (default Steam path)
#         .\build.ps1 "D:\Games\Deadlock\game\bin\win64"
param([string]$DeadlockDir = "C:\Program Files (x86)\Steam\steamapps\common\Deadlock\game\bin\win64")

if (-not (Test-Path "$DeadlockDir\deadworks.exe")) {
    Write-Host "deadworks.exe not found in $DeadlockDir" -ForegroundColor Red
    Write-Host "Copy the Deadworks release into your Deadlock folder first (see README), or pass the win64 path as argument."
    exit 1
}
dotnet build -c Release "-p:DeadlockDir=$DeadlockDir"
