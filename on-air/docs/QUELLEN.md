# Musikquellen, Auswahl und Komfortbefehle

ON AIR nimmt Wünsche als **Spotify-, YouTube-/YouTube-Music-, Apple-Music- und SoundCloud-Links**
oder als **„Künstler – Titel“** an. Gespielt wird immer die passende **Spotify-Version** – ON AIR
lädt nichts herunter und wechselt nie die Wiedergabeplattform.

> **Teststand:** Alle Anbieter-Adapter sind gegen simulierte Anbieter (Fake-HTTP) getestet.
> Ein Live-Test mit echten YouTube-, Apple- und SoundCloud-Zugangsdaten steht noch aus.

## Was ohne und mit Zugangsdaten geht

| Anbieter | Ohne Zugangsdaten | Mit Zugangsdaten | Einstellung |
|---|---|---|---|
| Spotify | Songs, Alben; Playlists nur eigene/gemeinsame (Development Mode) | – (normale Spotify-Anmeldung) | immer an |
| YouTube / YouTube Music | Einzelne Videos: Titel + Kanal über oEmbed (ohne Dauer) | + Dauer, Verfügbarkeit, **Playlists** (Data API v3) | *Musikquellen → YouTube* |
| Apple Music | Songs und Alben über die öffentliche iTunes-Lookup-API | + ISRC-Abgleich, **Playlists** (Apple Music API) | *Musikquellen → Apple Music* |
| SoundCloud | Einzelne Tracks: Titel + Uploader über oEmbed | + Dauer, ISRC (falls hinterlegt), **Sets/Playlists** | *Musikquellen → SoundCloud* |

Fehlen Zugangsdaten für eine Funktion, zeigt ON AIR „Einrichtung erforderlich“ (App) bzw. eine
verständliche Chatantwort – nie einen stillen Fehler. Jeder Anbieter lässt sich einzeln abschalten.

Zugangsdaten liegen ausschließlich im Windows-Anmeldespeicher (Credential Manager). Sie erscheinen
nicht in Einstellungen, Diagnoseexport, Logs, Chat oder OBS. In der App sind die Felder maskiert
und zeigen nur „hinterlegt“.

## Einrichtung pro Anbieter

### YouTube (optional, kostenlos)
1. <https://console.cloud.google.com/> → Projekt anlegen.
2. *APIs & Dienste → Bibliothek* → **YouTube Data API v3** aktivieren.
3. *Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel*. Empfohlen: Schlüssel auf
   „YouTube Data API v3“ beschränken.
4. In ON AIR: *Einstellungen → Musikquellen → YouTube* → Schlüssel einfügen → Speichern.

Standardkontingent: 10.000 Einheiten/Tag; ein Videoabruf kostet 1 Einheit, eine Playlist-Seite
(50 Einträge) etwa 2. Bei erschöpftem Kontingent: „YouTube-Abfragen sind gerade ausgelastet“.

### Apple Music (optional, Apple Developer Program nötig)
Einzelne Song- und Albumlinks funktionieren **ohne** Einrichtung. Für Playlists und ISRC:
1. Mitgliedschaft im Apple Developer Program.
2. *Certificates, Identifiers & Profiles → Keys* → neuen Schlüssel mit **MusicKit** anlegen,
   `.p8`-Datei laden, Key-ID und Team-ID notieren.
3. Developer Token (JWT, ES256, `iss` = Team-ID, `kid` = Key-ID, Laufzeit max. 6 Monate) erzeugen –
   z. B. mit einem MusicKit-Token-Generator auf dem eigenen Rechner. Die `.p8`-Datei gehört nicht in ON AIR.
4. In ON AIR: *Musikquellen → Apple Music* → Token einfügen. Nach Ablauf neuen Token hinterlegen.

### SoundCloud (optional)
Einzelne Tracklinks funktionieren **ohne** Einrichtung.
1. App im SoundCloud-Entwicklerportal registrieren (<https://soundcloud.com/you/apps>).
2. Client-ID und Client-Secret notieren (Client-Credentials-Verfahren, keine Nutzeranmeldung).
3. In ON AIR: *Musikquellen → SoundCloud* → `client_id:client_secret` einfügen.

### Spotify-Playlists im Development Mode
Seit Februar 2026 liefert Spotify Playlist-Inhalte im Development Mode nur für **eigene oder
gemeinsame** Playlists. Fremde/redaktionelle Playlists zeigen „nicht zugänglich“ – dann bitte einen
einzelnen Songlink oder „Künstler – Titel“ schicken. Die ISRC fehlt in Spotify-Tracks im
Development Mode; ON AIR gleicht über Titel, Künstler, Version und Dauer ab (und nutzt die ISRC
anderer Anbieter als Suchfilter, wenn vorhanden).

## Sicherheit beim Auflösen
- Links werden lokal zerlegt; abgerufen werden nur **feste Anbieter-Endpunkte** mit der daraus
  gelesenen ID – nie die eingegebene URL selbst.
- Kurzlinks (`spotify.link`, `spoti.fi`, `on.soundcloud.com`, `soundcloud.app.goo.gl`) werden ohne
  automatische Weiterleitung abgerufen; jedes Ziel wird erneut gegen die Anbieterliste geprüft
  (max. 5 Sprünge). Fremde Hosts, Benutzerangaben in URLs, Ports und interne Ziele werden abgelehnt.
- Tracking-Parameter (`si`, `utm_*`, `feature`, …) werden ignoriert; regionale Pfade (`/intl-de/`,
  Apple-Storefronts) werden erkannt.
- Zeitlimits, Zwischenspeicher (10 min) und Ratelimit-Erkennung pro Anbieter.

## Zuordnung zur Spotify-Version
- Titel werden bereinigt („Official Video“, „Lyrics“, „HD“ …), Versionsangaben bleiben erhalten:
  Original, Remix (inkl. Remixer), Live, Acoustic, Instrumental, Cover, Remaster, Explicit/Clean,
  sped up, slowed.
- Kanal/Uploader wird **nicht** automatisch als Künstler übernommen (Ausnahme: „… - Topic“/VEVO).
- Eindeutig heißt: passender Titel, Künstler, gleiche Version und plausible Dauer (bzw. gleiche
  ISRC). Sonst: kleine Auswahl (max. 3, einstellbar) mit Titel, Künstler, Version und Dauer.
- Kein Treffer: Erklärung + Vorschlag „Künstler – Titel“ oder Spotify-Link.
- Gespeichert werden Originalquelle, ausgewählte Spotify-Version und die Entscheidung
  (eindeutig, ISRC, Auswahl durch Zuschauer).

## Chatbefehle

| Befehl | Wirkung | Beispiel |
|---|---|---|
| `!sr <Link oder Künstler – Titel>` | Wunsch; bei mehreren Versionen/Playlist folgt eine Auswahl | `!sr https://youtu.be/dQw4w9WgXcQ` |
| `!auswahl <N>` (`!choose`, `!wahl`, `!pick`) | Option N der offenen Auswahl übernehmen | `!auswahl 2` |
| `!weiter` / `!zurueck` (`!next`, `!zurück`, `!back`) | In einer Playlist-Auswahl blättern | `!weiter` |
| `!abbrechen` (`!cancel`) | Offene Auswahl verwerfen (Kanalpunkte werden erstattet) | `!abbrechen` |
| `!ersetzen <…>` (`!replace`) | Eigenen noch nicht übergebenen Wunsch austauschen, Platz bleibt | `!ersetzen Daft Punk – One More Time` |
| `!letztersong` (`!lastsong`, `!letzter song`, `!last song`) | Die letzten fünf in dieser Sitzung gespielten Songs | `!letzter song` |

Beispielablauf:
```
zuschauer: !sr https://youtu.be/abc123
ON AIR:    @zuschauer Ich habe mehrere passende Versionen gefunden: 1) Levels – Avicii (Original, 3:19) · 2) Levels – Avicii (Skrillex Remix, 4:40). Wähle mit !auswahl <Nummer> (oder !abbrechen).
zuschauer: !auswahl 2
ON AIR:    @zuschauer „Levels (Skrillex Remix)“ von Avicii ist auf Platz 3.
zuschauer: !ersetzen Avicii – Wake Me Up
ON AIR:    @zuschauer Dein Wunsch wurde geändert: „Wake Me Up“ von Avicii. Dein Platz in der Warteschlange bleibt erhalten.
zuschauer: !letzter song
ON AIR:    Zuletzt gespielt: …
```

Regeln der Auswahl:
- Gebunden an Kanal, Zuschauer und stabile IDs; nur der Zuschauer selbst kann wählen.
- Pro Zuschauer eine offene Auswahl – eine neue ersetzt die alte.
- Ablauf nach 120 s (einstellbar); danach Hinweis im Chat, Kanalpunkte werden erstattet.
- Playlists werden **nie komplett** übernommen; nur der gewählte Titel wird aufgelöst.
- Eine offene Auswahl belegt den Wunsch-Platz des Zuschauers, erscheint aber nicht in der
  Warteschlange, im Plan oder im OBS-Bild.

`!ersetzen`:
- Nur eigene Wünsche mit Status „angenommen“ oder „Moderation offen“. Bereits übergebene:
  „Schon an Spotify übergeben“.
- Mehrere eigene Wünsche: der vorderste wird ersetzt.
- Der alte Song bleibt während Suche, Auswahl und Prüfung bestehen und bei jedem Fehler erhalten.
- Volle Regelprüfung (Dauer, Sperrlisten, Duplikate, Streamplan mit der Dauer des alten Songs
  herausgerechnet, Moderation). Kein zweiter Platz, keine neuen Kanalpunkte; die Einlösung bleibt.
- Atomar gegen die Übergabe an Spotify abgesichert (Versionszähler); eigener Cooldown (20 s).

`!letztersong`:
- Nur tatsächlich beobachtete Wiedergaben der aktuellen Sitzung (neue Sitzung nach 3 h ohne
  Titelwechsel), neuester zuerst, ohne den laufenden Song, ohne Doppelungen durch Pause/Seek/Polling.
- Wünschender wird nur genannt, wenn der Song wirklich ein Wunsch war; kein Zugriff auf den
  privaten Spotify-Verlauf.
- Cooldowns: pro Zuschauer 30 s, global 10 s; Antworten bleiben unter 450 Zeichen.

## In der App
- **Song hinzufügen** erkennt Links automatisch; jede Option zeigt das Ergebnis der
  Vorabprüfung („Bereits auf Platz 4“, „Maximal 6 Minuten erlaubt“, „Requests sind gerade pausiert“,
  „Freigabe durch einen Moderator erforderlich“). Die Vorabprüfung reserviert nichts; beim
  Hinzufügen wird atomar erneut geprüft.
- Playlists/Alben: Seitenweises Laden, Filter über die bereits geladenen Titel (als Teilmenge
  gekennzeichnet), getrennte Schritte „Playlist-Titel wählen“ und „Spotify-Version bestätigen“.
- Zeilenmenü **„Song ändern“** (Platz bleibt) und **„Originallink öffnen“**.
- Offene Auswahlen erscheinen in der Warteschlange unter „Auswahl offen“ und lassen sich entfernen.
