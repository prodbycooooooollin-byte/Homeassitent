# Einrichtung

ON AIR verwendet **deine eigenen** Developer-Apps bei Spotify und Twitch. Es werden
keine Zugangsdaten oder App-IDs von Songify oder anderen Programmen übernommen.
Beim ersten Start führt die App durch dieselben Schritte.

## 1. Spotify-App anlegen

Voraussetzung (Stand 2026): Spotify verlangt für Apps im Development Mode ein
**Premium-Konto** des App-Besitzers; Wiedergabesteuerung und Queue benötigen ohnehin Premium.

1. https://developer.spotify.com/dashboard öffnen und anmelden.
2. **Create app**: Name frei, Beschreibung frei, bei „Which API/SDKs are you planning to use?“ **Web API** wählen.
3. **Redirect URI** exakt eintragen: `http://127.0.0.1:43821/callback`
   (Spotify erlaubt Loopback nur mit expliziter IP, nicht `localhost`. Wenn du in
   ON AIR den Port änderst, hier ebenfalls anpassen.)
4. Speichern, **Client ID** kopieren und in ON AIR einfügen. Ein Client Secret wird
   **nicht** benötigt und nicht verwendet (PKCE).
5. Unter **User Management** dein Spotify-Konto (Name + E-Mail) eintragen.
   Development Mode lässt nur bis zu 5 freigeschaltete Nutzer zu.
6. In ON AIR **Spotify verbinden** – der Systembrowser öffnet sich, danach zurück zur App.

Wenn die Anmeldung klappt, aber Abfragen mit „Zugriff verweigert“ scheitern, zeigt
**Verbindung prüfen** den genauen Grund (z. B. Konto nicht freigeschaltet, Premium nötig).

Spotify-Anmeldungen laufen **etwa 6 Monate nach der Autorisierung** ab. ON AIR warnt
rechtzeitig und fordert dann gezielt zur Neuanmeldung auf; Queue und Einstellungen bleiben.

## 2. Twitch-App anlegen (optional, für Chatrequests)

1. https://dev.twitch.tv/console/apps/create öffnen.
2. Name frei, **OAuth Redirect URL**: `http://localhost` (Pflichtfeld, vom Geräte-Code-Ablauf nicht genutzt).
3. Kategorie „Chat Bot“ (oder „Other“), **Client-Typ: Öffentlich / Public**.
4. **Client ID** in ON AIR einfügen und **Twitch verbinden** klicken.
5. Im Browser öffnet sich `twitch.tv/activate` – den in ON AIR angezeigten Code eingeben
   und die Rechte „Chat lesen“ und „Chat senden“ bestätigen.

ON AIR liest und schreibt den Chat **deines** Kanals mit deinem Konto. Twitch-Anmeldungen
öffentlicher Clients verfallen nach 30 Tagen ohne Nutzung; bei regelmäßigem Betrieb
erneuert ON AIR sie automatisch.

### Kanalpunkte (optional, nur Affiliates/Partner)

1. *Einstellungen → Kanalpunkte* einschalten. ON AIR fordert dafür einmalig die zusätzliche
   Berechtigung `channel:manage:redemptions` an (erneut den Code auf `twitch.tv/activate` eingeben).
2. ON AIR legt die Belohnung „Song wünschen“ selbst an (Titel, Kosten, Eingabehinweis und
   Limits sind einstellbar). Eine **von Hand** im Twitch-Dashboard angelegte Belohnung kann
   ON AIR nicht verwalten – Twitch erlaubt Erfüllen/Stornieren nur für Belohnungen derselben Client-ID.
   Wird eine solche Belohnung (mit Texteingabe) eingelöst, zeigt ON AIR das unter *Kanalpunkte*
   und im Aktivitätsprotokoll an und bietet **„… verwenden“** an: Wünsche daraus landen dann in
   der Warteschlange; abgelehnte Wünsche musst du auf Twitch selbst erstatten, und die Belohnung
   wird nicht automatisch pausiert.
3. Chat und Kanalpunkte sind unabhängig schaltbar; „Requests annehmen“ in der Übersicht
   pausiert beide, ohne ihre Einstellungen zu ändern.
4. **Kommt ein Kanalpunkte-Wunsch nicht an?** Jede Einlösung steht mit Ergebnis im
   Aktivitätsprotokoll (angenommen, wartet auf Freigabe, abgelehnt mit Grund, fremde Belohnung
   ignoriert). „Letzte Einlösung“ unter *Kanalpunkte* zeigt, ob überhaupt etwas von Twitch ankommt.
   Wer als Streamer selbst einlöst, gilt als Broadcaster (Limits wie „max. offene Wünsche pro
   Person“ gelten dann nicht).

### Eigene Chatbefehle

*Einstellungen → Chatbefehle → Eigene Befehle*: Vorlage wählen (Discord, Socials, Anleitung
Songwunsch, Link zum Song, Nächster Song, Wer hat's gewünscht, Lurk, Umarmen, Würfeln, 8-Ball,
Love-Meter) oder leer anlegen. Jeder Befehl hat Name, Aliasse, Mindestrolle, Cooldown und eine
Antwort mit Platzhaltern: `{user}`, `{touser}`, `{args}`, `{channel}`, `{song}`, `{title}`,
`{artist}`, `{link}`, `{requester}`, `{next}`, `{queue_count}`, `{playlist}`, `{random:1-6}`,
`{pick:a|b|c}`. Eingebaute Befehle haben bei gleichem Namen Vorrang (die App weist darauf hin).

### Sammel-Playlist (optional)

*Einstellungen → Requests → Sammel-Playlist*: Jeder angenommene Songwunsch ab dem Einschalten
landet einmal in einer Spotify-Playlist, die ON AIR selbst anlegt (Name und Sichtbarkeit
einstellbar, App-Wünsche optional). Spotify erlaubt 10.000 Titel pro Playlist – danach legt ON AIR
automatisch „… · Teil 2“ an. Dafür braucht ON AIR die Spotify-Rechte `playlist-modify-private`
und `playlist-modify-public`; Anmeldungen aus älteren Versionen haben sie nicht – die App bittet
dann einmal um „Spotify neu verbinden“, vorgemerkte Wünsche werden danach nachgetragen.

## 3. Wiedergabegerät

Spotify auf dem Gerät öffnen, das im Stream laufen soll, und einen Song starten. ON AIR
erkennt das Gerät automatisch. Die Wiedergabe wird nie ungefragt auf ein anderes Gerät
verschoben; unter „Gerät wählen“ kannst du sie ausdrücklich übertragen.

## 4. OBS

1. In ON AIR unter **Widgets** ein Preset wählen und **URL kopieren**
   (z. B. `http://127.0.0.1:43822/widget/glass`).
2. In OBS: Quelle hinzufügen → **Browser** → URL einfügen, Breite/Höhe wie in der App empfohlen.
3. Optional: **Now-Playing-Textdatei** aktivieren und in OBS als Textquelle („aus Datei lesen“) einbinden.

Die Widgets verbinden sich nach einem Neustart von ON AIR selbstständig wieder und
blenden sich bei veralteten Daten aus. Die Anzeige von Metadaten erteilt keine Rechte
zur Ausstrahlung der Musik.

### OBS-Dock (ON AIR in OBS steuern)

1. In ON AIR unter **Widgets → OBS-Dock** auf **Dock-URL kopieren** klicken.
2. In OBS: **Docks → Benutzerdefinierte Browser-Docks …**, Name „ON AIR“, URL einfügen, übernehmen.
3. Das Dock lässt sich frei andocken. Es zeigt Now Playing und die nächsten Requests und kann
   Requests pausieren/öffnen, pausieren/fortsetzen, überspringen, Wünsche freigeben/ablehnen/entfernen
   und die Streamplanung um 15 Minuten verlängern.

Die Dock-URL enthält einen geheimen Schlüssel (nur auf diesem PC nutzbar) – nicht im Stream zeigen.

### `!playlist`

Zuschauer schreiben `!playlist` (Alias `!pl`) und bekommen den Link zur gerade laufenden
Spotify-Playlist (mit Namen), bei einem Album den Album-Link. Spotify erlaubt kein Herunterladen –
der Link öffnet die Playlist zum Folgen oder Speichern. Private Playlists werden nicht geteilt.
Optional lässt sich unter *Einstellungen → Chatbefehle* ein Standard-Link hinterlegen, der gilt,
wenn gerade keine Playlist läuft.

### Links von YouTube, Apple Music, SoundCloud (optional)

`!sr` versteht neben Spotify-Links auch YouTube-/YouTube-Music-, Apple-Music- und SoundCloud-Links
sowie „Künstler – Titel“. Einzelne Songlinks funktionieren ohne Einrichtung; für Playlists und
genauere Zuordnung lassen sich unter *Einstellungen → Musikquellen* Zugangsdaten hinterlegen.
Anleitung pro Anbieter sowie `!auswahl`, `!ersetzen` und `!letztersong`: [QUELLEN.md](QUELLEN.md).

## Streamplanung

In der Übersicht unter *Streamplanung* die verbleibende Streamzeit wählen (15/30/60/90 Min)
oder eine Endzeit eintragen. ON AIR nimmt dann nur Requests an, die voraussichtlich noch
vor dem Ende (abzüglich Puffer, Standard 2 Min) laufen. „+15 Minuten“ verlängert,
„Planung beenden“ hebt die Begrenzung auf.

## Updates

Siehe [UPDATES.md](UPDATES.md) – einmal `ON-AIR-Setup_<version>.exe` aus dem neuesten Release installieren, danach
über *Einstellungen → Updates*.

## Stream Deck / Fernsteuerung (optional)

Unter Widgets → „Fernsteuerung“ aktivieren und das Steuer-Token anzeigen lassen. Dann z. B.:

```powershell
Invoke-WebRequest -Method POST -Uri http://127.0.0.1:43822/api/control/skip -Headers @{ "X-OnAir-Token" = "<Token>" }
```

Verfügbar: `skip`, `open_requests`, `close_requests`. Nur von diesem Rechner erreichbar.
