# Aurora – modernes Spotify für den Desktop

Rundes, cleanes Redesign der nativen Spotify-App (via [Spicetify](https://spicetify.app)):
schwebende abgerundete Panels, Hover-/Seitenanimationen, Glas-Playbar und eine
**Fullscreen-Lyrics-Seite** (Cover-Blur-Hintergrund, synchronisierte Zeilen, Zeile aktiv = groß/scharf,
Klick auf Zeile = Sprung, Fortschritt + Steuerung).

## Installation (Windows)
1. Spotify von spotify.com installieren (nicht Microsoft Store), einmal starten, Spotify schließen.
2. PowerShell im Ordner `spotify-redesign` öffnen: `.\install.ps1`
3. In Spotify: Playbar-Button „Aurora Lyrics“ oder **Strg+L**, **Esc** schließt.

Rückgängig: `spicetify restore`. Nach Spotify-Updates: `spicetify backup apply`.

Lyrics kommen von lrclib.net (kostenlos, synchronisiert wenn vorhanden).
Farben anpassen: `Aurora/color.ini` (`button` = Akzentfarbe), danach `spicetify apply`.
