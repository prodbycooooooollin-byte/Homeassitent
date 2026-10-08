# Aurora für die native Spotify-Desktop-App installieren (Windows, PowerShell)
# Vorher Spotify (von spotify.com, NICHT Microsoft Store) installieren und einmal starten.
$ErrorActionPreference = "Stop"
iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex

$themes = Join-Path (spicetify -c | Split-Path) "Themes\Aurora"
New-Item -ItemType Directory -Force $themes | Out-Null
Copy-Item "$PSScriptRoot\Aurora\*" $themes -Recurse -Force

spicetify config current_theme Aurora color_scheme Aurora
spicetify config inject_css 1 replace_colors 1 overwrite_assets 1 inject_theme_js 1
spicetify backup apply
Write-Host "Fertig! In Spotify: Lyrics-Button in der Playbar oder Strg+L." -ForegroundColor Green
