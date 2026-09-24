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
- **Kanalpunkte** wurden nur gegen einen Fake-Twitch getestet. Feldnamen und Fehlercodes der
  Helix-Endpunkte stammen aus der recherchierten Dokumentation, nicht aus einem echten Aufruf.
  Nicht geprüft: Verhalten mit echtem Affiliate-Konto, Twitch-Ratelimits bei vielen Einlösungen.
- **Updater**: kein echter Update-Durchlauf auf Windows; Secrets sind im Repository noch nicht
  hinterlegt – bis dahin baut der Release-Workflow nicht (bewusst). Siehe [UPDATES.md](UPDATES.md).
- **Streamplanung** rechnet mit den Titeldauern aus Spotify. Crossfade, Werbung und manuelles
  Springen machen die Prognose ungenau; ON AIR zeigt das als „unsicher“ an, misst es aber nicht.
- Das neue Design wurde in Chromium bei 1280×720 und 1920×1080 sowie simulierten
  Skalierungen geprüft, nicht in WebView2 auf einem echten Windows-Rechner.

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
- Weitere Player (YouTube Music/Pear), öffentliche Viewer-Seite, Fernmoderation, Lyrics, Canvas.
- Favoriten/Playlist-Aktionen.
- Aktivitätsprotokoll-Texte kommen aus dem Kern und sind derzeit nur Deutsch
  (UI-Texte sind vollständig auf Englisch vorbereitet).
- Updates werden gesucht und heruntergeladen, aber nie automatisch installiert (gewollt).
- Standby-Erkennung erfolgt über Sprünge der Wanduhr (portabel, aber keine Windows-Power-Events).
