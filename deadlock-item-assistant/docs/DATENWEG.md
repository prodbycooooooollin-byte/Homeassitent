# Datenweg – Recherche und Entscheidung

## Update 27.09.2026: vollautomatischer Weg über ow-electron

Die erste Entscheidung („Overwolf nicht gewählt“) ist überholt. Grundlage für die neue Entscheidung:

- **`@overwolf/ow-electron`**, derzeit Version 42.7.1, ist eine Electron-Variante mit gebündelter Overwolf-Laufzeit. Sie braucht keinen Overwolf-Client. Matchlock und andere eigenständige Deadlock-Apps arbeiten laut eigener Beschreibung so.
- Laut README des offiziellen Beispiels `github.com/overwolf/ow-electron-packages-sample` gibt es einen **Dev Mode** (ab ow-electron 39.8.10, nur Windows). Er lässt die Spielpakete (GEP, Overlay, Recorder) mit eigenen Zugangsdaten (`OW_DEV_KEY` oder `OW_CLI_EMAIL` plus `OW_CLI_API_KEY`) **lokal ohne Signatur und ohne Freigabe** laufen.
- Für ein persönliches Tool reicht das. Veröffentlichung und Freigabe sind nur für den Vertrieb nötig.
- **Deadlock-Spiel-ID:** 24482, laut `@overwolf/ow-electron-packages-types`.
- **GEP-API** laut Typdefinitionen:
  - Ablauf: `game-detected` → `event.enable()` → `setRequiredFeatures(id, null)`.
  - Daten kommen über `new-info-update` / `new-game-event` und `getInfo(id)`.
- **Deadlock-Schema** laut Overwolf-Doku, abgerufen nur über Such-Snippets, weil die Seite hier gesperrt ist:
  - `match_info.match_id`
  - `match_info.roster_N` mit `steam_id`, `is_local`, `team_id`, `hero_id`, `hero_name`, `level`, `kills`, `deaths`, `assist`, `hero_damage`, `souls`
  - `match_info.items_N` mit `steam_id` und `items[] {id, class_name, name, enhanced, upgrade_info}`
  - `match_info.incoming_damage` mit `time_filter`, `total_damage`, `damages[]`
  - `match_outcome`
  - Events: `match_start`, `match_end`, `match_clock` …
- **Bedeutung von `souls`** ist nicht dokumentiert. Die App misst sie: Sinkt der Wert beim eigenen Kauf um den Preis, sind es ausgebbare Souls. Bleibt er gleich oder steigt er, ist es der Gesamtwert, und das Budget wird berechnet.
- **Rohdaten** der ersten 20.000 Events werden zur Überprüfung in `%APPDATA%/deadlock-item-assistant/gep-rohdaten.jsonl` gespeichert.

**Automatische Erkennung** ohne Anmeldung:

- Steam-Konto aus `Steam/config/loginusers.vdf`
- laufendes Deadlock über `tasklist`
- Match-ID aus den Spielevents
- im Fallback: Community-API bzw. `console.log` (nur mit `-condebug`, Format unbestätigt)

**Nicht verifiziert** (keine Windows-Umgebung, `content.overwolf.com` hier gesperrt):

- ob der Dev Mode auch in der gepackten, unsignierten App greift oder nur beim Start per `ow-electron .`
- die exakten Wertformate der Events


Stand der Recherche: **27.09.2026**. In der Entwicklungsumgebung waren die meisten Hosts gesperrt: `api.deadlock-api.com`, `assets.deadlock-api.com`, `dev.overwolf.com`, `deadlock.wiki` und weitere. Erreichbar waren `raw.githubusercontent.com`, die GitHub-Weboberfläche per Abruf, die Websuche und npm.

Deshalb gilt:

- **Quellcode und Dokumentation** wurden gelesen.
- **Live-Endpunkte** wurden **nicht** gegen echte Server getestet.
- **Ein echtes Deadlock-Match** stand nicht zur Verfügung.

## Kurzentscheidung

| Weg | Liefert (laut Primärquelle) | Einschränkung | Entscheidung |
|---|---|---|---|
| **Overwolf GEP** (Deadlock) | Matchzustand, Spieler/Heroes, `souls`, Items; `incoming_damage` mit `time_filter` (Schadensfenster) | Freigabe nötig. Laut Overwolf werden **private Apps nicht genehmigt**. Monetarisierung nur über Overwolf-Werbung oder -Abos. Zusätzlicher Client nötig. | **Nicht gewählt**: für ein persönliches Tool ungeeignet. Es wird nichts angemeldet. |
| **Deadlock API Live Events** (Spectator/Broadcast, Open Source) | je Spieler: `hero_id`, `team`, `steam_id`, K/D/A, `net_worth`, `hero_damage` (gesamt), `upgrades` (Item-IDs); je Team: `flex_unlocked` | Verzögert (Broadcast); Match-ID nötig; **kein ausgebbares Budget**; kein Schaden gegen mich; keine Kaufzeitpunkte | **Umgesetzt** als Live-Provider. **Im echten Match ungetestet.** |
| **Schnelleingabe** | was der Nutzer sieht und einträgt | so aktuell wie die Eingabe | **Umgesetzt** als klar gekennzeichnete Alternative |
| **Bildschirmerkennung (OCR)** | sichtbares Scoreboard/Inventar | ohne echte Screenshots nicht verifizierbar | **Nicht umgesetzt** (siehe unten) |
| **Spieldateien** (SteamDB-Spiegel) | Items, Preise, Komponenten, Eigenschaften, Beschreibungen, Heroes, Fähigkeiten | statisch, patchgebunden | **Umgesetzt** (Build 6701 vom 25.09.2026) |

## Quellen im Detail

### Overwolf

Die Seite `dev.overwolf.com/ow-native/live-game-data-gep/supported-games/deadlock` war direkt nicht erreichbar. Die folgenden Angaben stammen aus den Such-Snippets der Seite:

- `match_info` mit Roster, `souls` und Items.
- `incoming_damage` mit `time_filter`, also einem Schadensfenster.

Freigaberegeln laut `dev.overwolf.com/ow-native/getting-started/project-roadmap`:

- „Overwolf currently doesn't approve private apps.“
- Es wird keine Monetarisierung durch Dritte genehmigt, nur Overwolf-Werbung oder -Abos.

**Die Semantik von `souls` bei Overwolf ist ungeklärt.** Es ist offen, ob damit Gesamt-Souls oder ausgebbare Souls gemeint sind. Das muss vor einer Nutzung geprüft werden.

### Deadlock API Live Events

Quelle: `github.com/deadlock-api/deadlock-api` (MIT), gelesen am 27.09.2026. Relevante Dateien:

- `live-events/README.md`
- `live-events/src/demo_parser/entity_events.rs`
- `live-events/src/demo_parser/hashes.rs`
- `api/src/routes/v1/matches/active.rs`
- `api/src/routes/v1/matches/live_url.rs`

Zugriff und Ablauf:

- **Endpunkt:** `GET /v1/matches/{match_id}/live/demo/events`, als Server-Sent Events mit benannten Events `{entity}_entity_created|updated|deleted`, `tick_end` und `end`.
- **Betrieb:** Selbst hostbar per Docker-Image `ghcr.io/deadlock-api/deadlock-live-events:latest` auf Port 3000. Der Dienst holt über `…/live/url` eine Broadcast-URL. Diese Abfrage ist begrenzt: pro IP 6 Anfragen je Stunde, mit API-Schlüssel mehr. Danach parst er die Demo.
- **Verzögerung:** Laut README wartet der Dienst „bis ca. 30 s“ auf die Demo. Laut Anbieter-Website liegen die Daten 60–90 s hinter dem Spiel. **Nicht gemessen.**

Feldsemantik laut Quellcode:

- `net_worth` = `m_PlayerDataGlobal.m_iGoldNetWorth` ist der Gesamtwert. Er ist **nicht** das ausgebbare Budget.
- `upgrades` = `m_PlayerDataGlobal.m_vecUpgrades` ist eine Liste von u64-IDs.
  - **Ungeklärt:** ob sie nur den aktuellen Besitz enthält oder auch Verkauftes.
  - **Ungeklärt:** wie die IDs auf Items abgebildet werden.
- `hero_damage` ist der Gesamtschaden gegen alle. Er ist kein Beleg für Schaden gegen mich.

Match-ID finden:

- `GET /v1/matches/active?account_ids=<SteamID3>` liefert nur die ca. 200 laufenden Matches, die im Spiel am meisten angesehen werden. Normale Matches sind damit in der Regel nicht auffindbar.
- Wo das Spiel während des Matches die eigene Match-ID anzeigt, ist **nicht verifiziert**.

### Spieldateien

Quelle: `github.com/SteamDatabase/GameTracking-Deadlock`, ein automatischer Spiegel der Spieldateien. Stand: `steam.inf`, ClientVersion **6701**, VersionDate **25.09.2026**. Genutzt werden:

- `scripts/abilities.vdata` (Items und Fähigkeiten)
- `scripts/heroes.vdata`
- `scripts/generic_data.vdata` (`m_nItemPricePerTier = [0, 800, 1600, 3200, 6400, 9999]`)
- englische Lokalisierung

Aus dem Spieltext `citadel_main_english` belegt:

- **Verkauf:** „half the purchase price“.
- **Zusatzslots:** Sie werden durch zerstörte Walker freigeschaltet (Slot 02–04).
- **Aktive Items:** Es gibt eine eigene Grenze („Active Slots Full“). Die Anzahl ist nicht belegt; die App nimmt **4** an und markiert das.

Aus Sekundärquellen (Web, 2026), als „reported“ markiert:

- 9 Basisslots
- Upgrade-Rabatt in Höhe des Komponentenpreises

Deutsche Itemnamen sind im Spiegel nicht enthalten. Die App zeigt daher die offiziellen englischen Namen. Die Namen in der Spielsprache lassen sich über `api.deadlock-api.com/v1/assets/items?language=german` abgleichen. Das ist implementiert, **aber gegen die echte API ungetestet**.

### Bildschirmerkennung

Nicht umgesetzt. Der Auftrag verlangt, die Machbarkeit zuerst an echten Screenshots zu prüfen. Solche lagen nicht vor. Eine OCR ohne Verifikation würde eine Zuverlässigkeit vortäuschen, die nicht belegt ist.

## Daten-Prototyp

`npm run probe -- --base http://localhost:3000 --match <ID> --account <SteamID3> --minutes 10` verbindet sich mit einem Live-Events-Dienst. Das Skript protokolliert Rohdaten und Änderungen und schreibt einen Bericht zu den fünf Fragen aus dem Auftrag:

1. Werden eigener Hero und Team erkannt?
2. Werden die gegnerischen Heroes und ihre Items erkannt?
3. Welche Souls-Werte gibt es?
4. Wie schnell erscheinen Änderungen?
5. Wann fehlen Werte?

Die Verzögerung gegenüber dem Spiel lässt sich nur mit parallel laufendem Spiel messen. Dazu im Spiel einen Kaufzeitpunkt notieren und mit dem Protokoll vergleichen.

**Dieser Prototyp lief in der Entwicklungsumgebung nur gegen einen lokalen Mock-Server, nicht gegen ein echtes Match.**
