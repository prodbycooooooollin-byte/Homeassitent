# Änderungen

## 0.2.0

- Neues Design der Desktop-App: Player im Mittelpunkt, Warteschlange mit Verlauf und Moderationsbereich, neu gegliederte Einstellungen.
- Songrequests mit Twitch-Kanalpunkten (optional, eigene verwaltete Belohnung, Abwicklung und Erstattung).
- Planung bis zum Streamende: Requests passend zur verbleibenden Streamzeit annehmen.
- Integrierter Updater mit signierten Updates über GitHub Releases.
- Erste Version mit Updater: einmalig manuell installieren, danach Updates direkt aus der App.
- Automatische Updates (Standard: an): im Hintergrund prüfen und laden, in einem sicheren Moment mit 30-Sekunden-Countdown installieren – nie während eines Livestreams oder einer Streamplanung.
- Automatische Releases bei jedem Push; Updates funktionieren ohne Einrichtung (Herkunft + SHA-256), optional zusätzlich signiert (`scripts/setup-updater.mjs`).
- Immersiver Installer `ON-AIR-Setup_<version>.exe` mit eigener Oberfläche; gebrandeter klassischer Installer.
- OBS-Dock: ON AIR als andockbares Fenster in OBS (Now Playing, Requests pausieren, Skip, Freigeben/Ablehnen/Entfernen, Streamplanung +15).
- Neuer Chatbefehl `!playlist` (Alias `!pl`): Link zur gerade laufenden Spotify-Playlist bzw. zum Album, optionaler Standard-Link.
- Eigene Chatbefehle mit Vorlagen (Discord, Socials, Lurk, Würfeln, 8-Ball …), Platzhaltern, Rolle, Cooldown und Live-Vorschau.
- Sammel-Playlist: jeder angenommene Songwunsch landet einmal in einer Spotify-Playlist (automatisch „Teil 2“ nach 10.000 Songs).
- Übersicht aufgeräumt: „Als Nächstes“ breit unter dem Player, Steuerung, Planung und Aktivität in einer schmalen Spalte.
- Kanalpunkte: Jede Einlösung steht mit Ergebnis im Aktivitätsprotokoll; Einlösungen fremder (von Hand angelegter) Belohnungen werden angezeigt statt still ignoriert und können übernommen werden; wer als Streamer selbst einlöst, gilt als Broadcaster.
- Behoben: Ein an Spotify übergebener Song, der nie als laufend erkannt wurde, hing dauerhaft in „In Spotify“ und blockierte alle weiteren Wünsche. Jetzt: Abgleich mit Spotifys Queue nach 90 s, Erkennung von Spotify-Relinking (andere Fassung desselben Songs) und ein Knopf „Als erledigt markieren“.
- Behoben: Umschalten eines Chatbefehls in den Einstellungen machte die App grau (Dokument verschob sich).
- Behoben: Kanalpunkte-Wünsche bekamen keine Rückmeldung im Chat – jetzt dieselbe Antwort wie bei `!sr`, bei Ablehnung mit Erstattungshinweis.
- Behoben: Kompaktmodus öffnete unter Windows ein graues, nicht schließbares Fenster und legte danach die App lahm (Pause-Knopf ohne Wirkung, leere Widget-Vorschau).
- Behoben: Verbindungsübersicht lag hinter dem Player und meldete „Alles verbunden“, obwohl Spotify nicht verbunden war.

## 0.1.0

- Erste Version: Spotify-Now-Playing, Chat-Songrequests, OBS-Widgets.
