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
- Live-Seite passt sich dem Song an: Akzent-, Schein- und Hintergrundfarbe aus dem Cover, weich überblendet (abschaltbar unter Erscheinungsbild).
- Titelwechsel, Pause und Weiterspielen werden schneller erkannt: Abfrage alle 1,5 s (vorher 3 s), im Pausezustand alle 2 s (vorher 8 s), gezielt zum Titelende.
- Neues Design „Nachtblau“ für alle Seiten: Navigation oben (Live, Warteschlange, Overlays, Verlauf), große „Jetzt läuft“-Bühne mit dünner Display-Schrift und Cover, „Als Nächstes“ als Kartenleiste, Statusleiste unten (Requests, Kanalpunkte, Streamende, Spotify/Twitch); OBS-Dock in denselben Farben.
- Stabilität: Kanalpunkte-Belohnung blieb dauerhaft pausiert („nicht synchron“), wenn der Abgleich offener Einlösungen mit Twitch dauerhaft scheiterte – jetzt nach drei Versuchen freigegeben; Belohnungen einer anderen Twitch-App-ID werden losgelassen statt endlos zu scheitern; „Erneut synchronisieren“ mit verständlicher Fehlerbeschreibung.
- Stabilität: Wünsche werden nicht mehr mit „technisch nicht möglich“ verworfen, wenn Spotify kurz nicht verbunden ist (werden gespeichert und nachgeholt) oder die Kanalpunkte-Einrichtung hakt; konkrete Gründe im Chat.
- Stabilität: Die Pause vor einem Update hebt sich nach 3 Minuten selbst auf, falls das Update nicht stattfand; nicht lesbarer Windows-Anmeldespeicher beim Start führt nicht mehr zu dauerhaftem „abgemeldet“; Fehlergrenzen verhindern eine leere App bei Darstellungsfehlern.
- Kompatibilität: Zertifikate des Systems werden zusätzlich genutzt (Antivirus mit HTTPS-Prüfung, Firmennetze).
- Leistung: Übersicht braucht rund 90 % weniger CPU (Fortschrittsbalken ohne Layout-Neuberechnung, ein gemeinsamer Takt, keine Arbeit bei verborgenem Fenster, keine Weichzeichner ohne Wirkung); OBS-Widget und -Dock ebenfalls sparsamer.
- Behoben: Ein an Spotify übergebener Song, der nie als laufend erkannt wurde, hing dauerhaft in „In Spotify“ und blockierte alle weiteren Wünsche. Jetzt: Abgleich mit Spotifys Queue nach 90 s, Erkennung von Spotify-Relinking (andere Fassung desselben Songs) und ein Knopf „Als erledigt markieren“.
- Behoben: Umschalten eines Chatbefehls in den Einstellungen machte die App grau (Dokument verschob sich).
- Behoben: Kanalpunkte-Wünsche bekamen keine Rückmeldung im Chat – jetzt dieselbe Antwort wie bei `!sr`, bei Ablehnung mit Erstattungshinweis.
- Behoben: Kompaktmodus öffnete unter Windows ein graues, nicht schließbares Fenster und legte danach die App lahm (Pause-Knopf ohne Wirkung, leere Widget-Vorschau).
- Behoben: Verbindungsübersicht lag hinter dem Player und meldete „Alles verbunden“, obwohl Spotify nicht verbunden war.

## 0.1.0

- Erste Version: Spotify-Now-Playing, Chat-Songrequests, OBS-Widgets.
