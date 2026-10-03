# Quellen, Zugangsdaten, Limits und Kosten

Stand der Prüfung: 30.09.2026. Alle Quellen werden serverseitig vom Recherche-Dienst abgefragt, nicht von jeder
installierten App. Ohne passende Zugangsdaten bleibt eine Quelle mit Status `inaktiv: …` sichtbar; die App zeigt
„Automatische Suche aktiv“ nur, wenn der Suchanbieter zuletzt tatsächlich erfolgreich abgefragt wurde.

## Implementierte Quelladapter

| Quelle (Adapter) | Zweck | Zugang | Bedingungen / Limits | Zugangsdaten | Status der Prüfung |
|---|---|---|---|---|---|
| `deadlock-api-leaderboard` | Spielerentdeckung: Top-Spieler je Region („Rangliste“) | `GET https://api.deadlock-api.com/v1/leaderboard/{Europe\|Asia\|NAmerica\|SAmerica\|Oceania}` | Community-API (Quellcode MIT). 1 Anfrage je Region und Lauf, 2 s Abstand. Namen sind nicht eindeutig → nur Einträge mit genau einer `possible_account_ids` werden angelegt. | keine | Antwortschema am Quellcode verifiziert (`api/src/routes/v1/leaderboard/types.rs`). Live-Abruf aus der Entwicklungsumgebung **nicht möglich** (Netzwerkrichtlinie). |
| `liquipedia` | Profis (aktives Team) + belegte Kanal-Links (Twitch, YouTube, X, Homepage, GitHub, Steam-ID) | `liquipedia.net/deadlock/api.php` (`list=categorymembers`, `prop=revisions` in 50er-Blöcken) | Liquipedia API Terms: ≤ 1 Anfrage/2 s, `action=parse` ≤ 1/30 s (nicht genutzt), eigener User-Agent mit Kontakt, gzip. Kein HTML-Scraping. Inhalte CC-BY-SA 3.0 → Attribution „Liquipedia“. | keine; `CITADEL_USER_AGENT` mit Kontakt ist Pflicht | Bedingungen per Websuche bestätigt; Infobox-Parameter (`team`, `status`, `twitch`, …) sind eine Annahme – bei Abweichungen erkennt der Adapter weniger, erfindet aber nichts. Live-Abruf **nicht möglich** hier. |
| `github-configs` | Echte veröffentlichte Config-Dateien (Community-Presets; Repos belegter Spieler-Konten) | GitHub REST (`/repos`, `/git/trees`, `/commits?path=`), `raw.githubusercontent.com` | ohne Token 60 Anfragen/h, mit Token 5000/h. Nur `video.txt`, `gameinfo.gi`, `*.cfg` ≤ 512 KB; Lizenz wird gespeichert. | optional `GITHUB_TOKEN` | Adapter gegen nachgebildete API getestet. Inhalte der konfigurierten Quelle (OptiLock) wurden per `git clone` gesichtet. |
| `web-pages` | Spieler-Homepages und Suchtreffer | HTTP(S) mit SSRF-Schutz, robots.txt | 1 Anfrage/3 s je Host, max. 2 MB, nur Text/HTML | keine | Pipeline getestet (Fixtures). |
| `brave-search` | Settings-Quellen für bekannte Spieler finden | `api.search.brave.com/res/v1/web/search` | kostenpflichtig/kontingentiert laut Anbieter – aktuelle Preise beim Anbieter prüfen | `BRAVE_SEARCH_API_KEY` | ohne Schlüssel `inaktiv`; nicht live getestet. |
| `youtube` | Beschreibungen neuer Deadlock-Videos auf belegten Spielerkanälen | YouTube Data API v3 (`channels`, `playlistItems`, `videos`) | Standardkontingent 10.000 Einheiten/Tag. **Keine Untertitel**: `captions.download` verlangt Bearbeitungsrechte am Video. | `YOUTUBE_API_KEY` | ohne Schlüssel `inaktiv`; nicht live getestet. |

Bewusst **nicht** umgesetzt:

- **Twitch-Chatbefehle** (`!sens`, `!settings`): Es gibt keinen universellen Endpunkt; CITADEL sendet keine Chatnachrichten.
  Twitch-Kanäle dienen nur als belegte Identität (Link aus Liquipedia).
- **Settings-Portale** (z. B. prosettings-artige Seiten): Nutzungsbedingungen für automatisierten Abruf nicht geprüft –
  werden höchstens über Suchtreffer als *Drittanbieterangabe* erfasst, wenn die Seite eine belegte Identität verlinkt,
  und nur, wenn robots.txt es zulässt.
- **Bild-Extraktion** (Screenshots von Settings): noch nicht angebunden.

## Identitäten und Zuordnung

- Spieler werden nur über stabile Kennungen zusammengeführt (Steam-Account-ID, Liquipedia-Seitentitel, Kanal-URL).
  Gleiche Nicknames werden **nicht** automatisch zusammengelegt.
- Primärquelle = Seite/Kanal/Repo, das in einer belegten Identität des Spielers steht → `auto-primary`.
- Drittseite zählt nur, wenn sie eine belegte Identität des Spielers verlinkt **und** den Namen nennt → `third-party`.
- Nur Namensgleichheit → ungeklärter Kandidat (`player_hint`), nie veröffentlicht.

## Abgleich (reconcile)

Priorität: `manual-confirmed` > `auto-primary` > `third-party`. Veröffentlicht wird ein neuer Wert, wenn es der erste
belegte Wert ist, dieselbe Quelle einen neuen Wert meldet, eine höher priorisierte Quelle ihn nennt, oder bei
gleicher Priorität ein **belegt neueres** Datum vorliegt. Das Abrufdatum zählt nie als Bestätigung. Alles andere wird
als Konflikt gespeichert und in der App angezeigt; der bestehende Wert bleibt.

## AI-Extraktion und Kosten

- Nur für Freitext, wenn die Regeln nichts finden, die Seite Deadlock nennt und die Zuordnung zum Spieler belegt ist.
- Modell: `CITADEL_AI_MODEL` (Standard `claude-opus-5-5`, Aufwand „low“, strukturierte Ausgabe, serverseitiger Fallback bei Ablehnungen).
- Schutz: Quellinhalt als Daten markiert; jedes Ergebnis braucht ein **wörtliches Zitat**, das im Quelltext vorkommen und den Wert enthalten
  muss – sonst verworfen. Fehlende Werte kann das Modell dadurch nicht ergänzen.
- Kostenkontrolle: Tagesbudget `CITADEL_AI_DAILY_BUDGET_USD` (Standard 2 USD), Cache je (URL, Inhalts-Hash, Extraktorversion) – unveränderte
  Seiten werden nie erneut geschickt. Preise im Code: Opus 5.5 4 $/20 $ je 1 Mio. Tokens (Stand 09/2026, beim Anbieter prüfen).
  Grobe Größenordnung: eine Seite mit ~15.000 Tokens ≈ 0,07 $ → das Standardbudget reicht für etwa 25–30 neue Seiten pro Tag.
- Eine dauerhaft kostenlose, unbegrenzte AI-Recherche gibt es nicht. Ohne `ANTHROPIC_API_KEY` läuft die rein regelbasierte Extraktion weiter.

## Intervalle, Caching, Robustheit

- Settings-Quellen: `CITADEL_SETTINGS_INTERVAL_HOURS` (Standard 18 h), Entdeckung: `CITADEL_DISCOVERY_INTERVAL_HOURS` (72 h).
- Bedingte Anfragen (ETag/Last-Modified), Inhalts-Hash, unveränderte Inhalte werden nicht neu verarbeitet.
- Jobs mit Lease (10 min), Wiederaufnahme nach Absturz, exponentielles Backoff (1 min … 6 h, `Retry-After` wird beachtet), max. 5 Versuche;
  dauerhafte Fehler (4xx, blockiertes Ziel, robots.txt) werden nicht wiederholt.
- SSRF-Schutz: nur http/https auf Port 80/443, DNS-Auflösung wird beim Verbindungsaufbau geprüft (keine privaten, lokalen,
  Link-Local- oder Multicast-Ziele), jede Weiterleitung wird erneut geprüft, keine Zugangsdaten in URLs.
- Verschwundene Quelle (404/410) → Ereignis `source-gone`, Wert bleibt bis zu einer neuen Beobachtung.

## Referenzen für die Katalog-Belege

- OptiLock (GPL-3.0): https://github.com/dacooderr/OptiLock – `cvarlist.md`, Beispielbild einer vom Spiel geschriebenen `video.txt`, `gameinfo.gi`.
  Performance-Versprechen und Mod-Abhängigkeiten des Presets sind **nicht** als geprüft übernommen.
- Skip-eo Deadlock-Config (als veraltet markiert): https://github.com/Skip-eo/Deadlock-Config
- Liquipedia API Terms of Use: https://liquipedia.net/api-terms-of-use
- Deadlock-API (MIT): https://github.com/deadlock-api/deadlock-api
- YouTube captions.download: https://developers.google.com/youtube/v3/docs/captions/download
- Intel PresentMon: https://github.com/GameTechDev/PresentMon
