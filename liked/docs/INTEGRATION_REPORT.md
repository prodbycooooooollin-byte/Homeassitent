# Integrationsbericht: TikTok-Likes und Wiedergabe

Stand: 26.09.2026. Dieser Bericht enthält keine Zugangsdaten, Cookies oder privaten Accountinhalte.

## Ergebnis vorweg

| Schritt des Integrationsnachweises | Umgesetzt | Mit echtem TikTok-Konto getestet |
|---|---|---|
| 1. „TikTok verbinden“ | ja (Desktop → eigener Auth-Dienst → TikTok Login Kit im System-Browser) | **nein** |
| 2. Echter Anmeldeablauf auf TikTok | ja (OAuth v2, `state`-geschützt, Secret nur im Backend) | **nein** |
| 3. Verbundener Account eindeutig erkannt | ja (`/v2/user/info/`, Anzeigename) | **nein** |
| 4. „Likes synchronisieren“ mit ehrlichen Zuständen | ja (8 getrennte Zustände, Fortschritt, Backoff, Abbruch) | nur gegen nachgebaute API |
| 5. ≥ 10 importierte Like-IDs eines Testnutzers | Parser + Pipeline fertig | **nein** |
| 6. Stichprobenvergleich mit realer Like-Liste | Oberfläche „Integrationsnachweis“ zeigt die ersten 10 IDs mit Datum | **nein** |
| 7. Abspielen im Windows-Client | Embed Player v1 eingebaut | **nein** (tiktok.com in der Build-Umgebung gesperrt) |
| 8. Wiederherstellung nach Neustart | ja (Gerätegeheimnis per DPAPI, Statusabfrage beim Start) | Logik getestet, nicht mit TikTok |
| 9. Trennen entfernt Zugangsdaten | ja (Token-Widerruf, Serverdatensatz, lokales Geheimnis, Web-Sitzung, Index) | gegen nachgebaute API getestet |

**Konkrete Blockade:** Für den automatischen Import braucht es eine bei TikTok registrierte App, die für
**Login Kit** und die **Data Portability API** (Scope `portability.activity.single` oder `.ongoing`) freigegeben
ist. Dazu kommt ein zustimmender Testnutzer mit Konto aus dem EWR oder dem Vereinigten Königreich. Beides lag
nicht vor. Außerdem waren `developers.tiktok.com` und `www.tiktok.com` aus der Build-Umgebung nicht erreichbar
(Netzwerkrichtlinie). Die aktuelle Dokumentation konnte deshalb nicht direkt gelesen werden. Die Umsetzung
beruht auf den Quellen aus der Spezifikation, auf Suchergebnissen zur offiziellen Doku (Scope-Schema
`portability.<typ>.single|ongoing`, Typen `all`, `activity`, `directmessages`, `postsandprofile`) und auf dem
Quellcode des npm-Pakets `tiktok-video-element`, der das Nachrichtenformat des Embed Players v1 bestätigt.

**Deshalb gilt ausdrücklich:** Die Anwendung ist als Spiel mit Demo-Adapter vollständig spielbar. Sie ist aber
**nicht** als fertiges Produkt mit funktionierendem Like-Import freigegeben.

## Gewählte Methode

### Offizieller Adapter (Standardweg)

1. **Desktop:** erzeugt ein zufälliges 32-Byte-Gerätegeheimnis und speichert es mit Windows DPAPI
   (`safeStorage`). Es identifiziert nur das Gerät gegenüber dem Auth-Dienst, nicht die Spielidentität.
2. **Desktop → Server** `POST /api/tiktok/login` (Bearer = Gerätegeheimnis). Der Server erzeugt einen
   einmaligen `state` (10 min gültig) und liefert
   `https://www.tiktok.com/v2/auth/authorize/?client_key…&scope…&response_type=code&redirect_uri…&state…`.
3. Der **System-Browser** öffnet die TikTok-Anmeldung. LIKED sieht kein Passwort und baut kein Passwortfeld nach.
4. **TikTok → Server** `GET /auth/tiktok/callback?code&state`. Der Server tauscht den Code mit dem Client-Secret
   über `POST https://open.tiktokapis.com/v2/oauth/token/` und speichert die Tokens AES-256-GCM-verschlüsselt
   in `DATA_DIR/auth-store.bin`. Fehlt im erteilten Scope `portability.*`, lautet der Status
   **„nicht unterstützt“, nicht „bereit“**.
5. **Synchronisieren:** `POST /v2/user/data/add/` mit `{data_format:"json", category_selection_list:["activity"]}`.
   Danach prüft der Server `POST /v2/user/data/check/` mit Backoff (60 s × 1,5ⁿ, höchstens 15 min, Abbruch nach 7 Tagen).
   Laufende Anfragen werden nach einem Serverneustart fortgesetzt.
6. **Bereit:** `POST /v2/user/data/download/` lädt das Archiv als Datenstrom in eine kurzlebige Datei (`0600`). Der
   Streaming-Parser liest **nur** `… → "Like List" → ItemFavoriteList[] {Date, Link}`. Lesezeichen („Favorite
   Videos“), Verlauf, Nachrichten und eigene Uploads werden ignoriert und nicht gespeichert. Die Datei wird im
   `finally` gelöscht.
7. **Übergabe:** `GET /api/tiktok/likes` liefert die IDs mit Datum **einmalig** an das Gerät. Danach löscht der
   Server sie (spätestens nach 24 h). Der Desktop speichert einen begrenzten Index (max. 5 000 Einträge, nur
   `id` und `t`).
8. **Trennen:** `DELETE /api/tiktok/connection` widerruft das Token (`/v2/oauth/revoke/`) und löscht den
   Serverdatensatz. Lokal werden Geheimnis und Index entfernt.

**Lokal vs. Server:** Tokens liegen nur im Auth-Dienst. Sie gelangen nie in Raumzustand, Socket-Nachrichten oder
Logs; dafür gibt es automatische Tests. Der Client kennt nur das Gerätegeheimnis. In einen Spielraum gehen
höchstens 40 ausgewählte Video-IDs plus gesalzene, gekürzte Hashes des Index (für die Überschneidungsprüfung).

**Nicht verifizierte Annahmen (vor Produktivbetrieb prüfen):**
- Genaue Werte von `status` bei `/v2/user/data/check/`. Abgebildet wird tolerant: `pending/processing` → vorbereiten,
  `download/ready/complete` → bereit, `expired`, `cancelled`.
- Ob ein kleinerer Scope (`activity`) die „Like List“ tatsächlich enthält. Laut Spezifikation ist das
  gesondert zu bestätigen.
- Fehlercodes für „Region nicht unterstützt“ (werden über `region|not_supported|not_eligible` erkannt).
- Ob TikTok für diese App-Kategorie PKCE verlangt. Derzeit wird der Web-Flow mit `state` verwendet.

### Experimenteller lokaler Web-Adapter (standardmäßig aus)

In *Einstellungen → TikTok* ausdrücklich einschaltbar. Es öffnet sich eine separate, isolierte TikTok-Webansicht
(Partition `persist:tiktok-web`, Sandbox, keine Node-Rechte), in der sich der Nutzer **selbst** anmeldet. Die
Anmeldung wird nur am Vorhandensein des Session-Cookies erkannt; Cookie-Werte werden nicht gelesen. Beim
Synchronisieren liest LIKED ausschließlich sichtbare `/video/`-Links, **solange der Reiter „Gefällt mir“ des
eigenen Profils aktiv ist**. Links des eigenen Accounts werden verworfen. Captchas oder Sperren werden nicht
umgangen, und LIKED scrollt nicht automatisch. **Ungetestet**: Selektoren, Reiter-Erkennung und die
Nutzungsbedingungen von TikTok. Der Adapter bleibt so lange als experimentell gekennzeichnet, bis ein realer
Test erfolgt ist.

### Demo-Adapter

Deterministische `demo-…`-IDs mit lokal gerenderten Testclips (Canvas + Web Audio). Demo-Räume akzeptieren nur
Demo-Pools, TikTok-Räume nur TikTok-Pools. Die Oberfläche zeigt überall „DEMO“. Ein Demo-Pool wird nie als
Account-Import geführt.

### Datenexport

Ein manueller Import ist **nicht** eingebaut. Der Archivparser würde auch eine vom Nutzer heruntergeladene Datei
lesen, ist aber bewusst nicht als normaler Ablauf in die Oberfläche eingebunden.

## Wiedergabe

- Offizieller **Embed Player v1**: `https://www.tiktok.com/player/v1/{id}` mit `controls=1, rel=0, description=0,
  music_info=0, native_context_menu=0, autoplay=0`. Die URL wird ausschließlich aus einer validierten
  numerischen ID gebaut.
- postMessage-Protokoll (`x-tiktok-player: true`): Ereignisse `onPlayerReady`, `onStateChange` (−1/0/1/2/3),
  `onCurrentTime`, `onMute`, `onVolumeChange`, `onError`; Befehle `play`, `pause`, `seekTo`, `mute`, `unMute`.
  Eingehende Nachrichten werden auf Origin `https://www.tiktok.com`, Quellfenster und Form geprüft.
  **Es gibt keinen `setVolume`-Befehl.** Die Videolautstärke läuft über den Regler im Player und ist in den
  Audioeinstellungen so beschriftet.
- Das iframe läuft mit `sandbox="allow-scripts allow-same-origin allow-presentation"`, also ohne Popups und
  ohne Navigation des Hauptfensters. Die Oberfläche wird über `app://liked` geladen. **Ungetestet ist, ob TikTok
  Einbettungen aus diesem Origin und mit dieser Sandbox akzeptiert.** Das ist der erste Punkt für den realen Test.
- Videoverkehr läuft direkt zwischen TikTok und Client. Der LIKED-Server überträgt nur IDs, Zustände und Stimmen
  und lädt keine URLs.

## Nächste Schritte für den realen Nachweis

1. TikTok-Developer-App anlegen, Login Kit (Web) mit Redirect `https://<server>/auth/tiktok/callback`
   einrichten, Data Portability API beantragen (Kategorie „activity“).
2. Server mit `TIKTOK_CLIENT_KEY/SECRET`, `TOKEN_ENCRYPTION_KEY`, HTTPS betreiben (siehe SERVER.md).
3. Mit einem zustimmenden EWR/UK-Testkonto die Schritte 1–9 der Tabelle durchgehen und die Ergebnisse hier
   eintragen: Anzahl IDs, Stichprobe (nur Anzahl der Übereinstimmungen), Wiedergabe von mindestens 3 Clips in
   der installierten App, Neustart, Trennen.
4. Erst danach den TikTok-Modus als „verfügbar“ kommunizieren.
