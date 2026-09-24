# Bekannte Einschränkungen (ehrlich)

## Nicht verifiziert
- **Keine Live-Tests mit echten Spotify-/Twitch-Konten.** In der Entwicklungsumgebung standen
  keine Zugangsdaten zur Verfügung; alle Integrationszustände wurden mit Fake-Providern
  **simuliert**. Der erste echte Login kann Abweichungen zur recherchierten Dokumentation zeigen
  (siehe Funktionsmatrix – Primärquellen waren aus der Umgebung nicht direkt abrufbar).
- **Kein achtstündiger Dauertest durchgeführt.** Plan und Messskript: [TESTS.md](TESTS.md).
  Es gibt keine gemessenen CPU-/Speicher-/Reconnect-Werte und keine Stabilitätsgarantie.
- **Windows-Installer**: wird über GitHub Actions (`windows-latest`) gebaut. Auf einem echten
  Windows-11-Rechner (Tray, Autostart, Credential Manager, Standby, Skalierung) wurde die App
  noch **nicht manuell getestet**. Die UI-Skalierung wurde nur im Browser (Chromium) mit
  simuliertem Skalierungsfaktor geprüft, nicht in WebView2.
- Der Installer ist **nicht signiert** → Windows SmartScreen warnt beim ersten Start.

## Durch die Anbieter bedingt
- Spotify Development Mode: Premium-Pflicht, max. 5 Nutzer, eingeschränkte Endpunkte. Eine
  Verteilung an beliebige Nutzer erfordert Extended Quota Mode (eigener Antrag bei Spotify).
- Spotify-Anmeldung muss spätestens alle ~6 Monate erneuert werden – „nie wieder anmelden“ ist unmöglich.
- Die Spotify-Queue kann nicht umsortiert oder bereinigt werden; `add to queue` ist nicht idempotent.
  Nicht auflösbare Fälle zeigt ON AIR als „Ausgang unklar“ zur Entscheidung an.
- Der Abgleich über `GET /me/player/queue` kann einen Request nicht von demselben Titel
  unterscheiden, den du selbst in Spotify eingereiht hast.
- Keine Push-Schnittstelle für Spotify → Polling (Standard 3 s bei Wiedergabe, gezielt kurz vor Titelende).
- Twitch-Chatantworten laufen über dein eigenes Konto (kein separates Bot-Konto in v1).

## Noch nicht umgesetzt
- Kanalpunkte-Requests und Rückerstattungen (vorbereitet: `reward_id` wird aus Chat-Events gelesen).
- Weitere Player (YouTube Music/Pear), öffentliche Viewer-Seite, Fernmoderation, Lyrics, Canvas.
- Favoriten/Playlist-Aktionen.
- Aktivitätsprotokoll-Texte kommen aus dem Kern und sind derzeit nur Deutsch
  (UI-Texte sind vollständig auf Englisch vorbereitet).
- Automatische Updates.
- Standby-Erkennung erfolgt über Sprünge der Wanduhr (portabel, aber keine Windows-Power-Events).
