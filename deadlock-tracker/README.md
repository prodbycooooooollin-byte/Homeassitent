# Deadlock Tracker

Match-Tracker für **Deadlock** (Funktionsumfang angelehnt an statlocker.gg): trackt deine Matches, zeigt pro Match eine
vollständige Summary beider Teams, dein **Performance-Rating (S/A/B/C/D/F)** und den **Ø Rang der Lobby**.

## Start

```bash
cd deadlock-tracker
npm install
cp .env.example .env.local     # optional anpassen
npm run build && npm start     # http://localhost:3100  (oder: npm run dev)
```

Account-ID eingeben (Steam32, Steam64 oder `steamcommunity.com/profiles/…`-Link). Vanity-URLs werden nicht aufgelöst.
Ohne Netzwerk: `DEADLOCK_DEMO=1` startet mit generierten Demo-Daten.

## Seiten & Funktionen

| Seite | Inhalt |
| --- | --- |
| Übersicht | Player Card, **Live-Match-Banner**, Kennzahlen (mit Hover-Erklärungen), Session-Bilanz mit Tilt-Warnung, Erkenntnisse, Rekorde, letzte Matches, Rang, Performance-Radar, Aktivitäts-Heatmap |
| Matches | Auswertung der Auswahl mit Gewinnkurve, sticky Filter (Suche, Ergebnis, Modus, Held, Noten), Listen-/Kachelansicht, Tagesgruppen mit Bilanz, **Hover-Vorschau** beider Teams, endloses Nachladen |
| Match | Tabs: Übersicht (Auszeichnungen, Teamvergleich, Lobby-Ränge), Lane, Verlauf, Items, Ereignisse. Die Zusammensetzung der Note erscheint nur als Hover am Noten-Badge bzw. Info-Symbol |
| Helden | Eigene Helden-Karten, Detailseite je Held, „Spielstil, Builds & Matchups“ |
| Rang | Verlauf mit Ø Lobby-Rang, „Top X %“, Rang-Punkte pro Match, Rangänderungen, Winrate nach Lobby-Stärke |
| Analyse | Winrate nach Tageszeit/Wochentag/Dauer/Lobby-Stärke, Radar, Rekorde, Erkenntnisse |
| Erfolge | 28 Serien mit bis zu 5 Stufen (Bronze–Diamant, ~100 Medaillen), Erfolgs-Level, „Als Nächstes“ |
| Mitspieler | Über die **gesamte Historie** aus der API (`mate-stats`/`enemy-stats`): Mitspieler, Premade, Gegner, Bester Partner/Nemesis |
| Vergleich | Duell zweier getrackter Spieler: Kennzahlen, Stärkenprofil, Notenverteilung, Heldenpool, gemeinsame Matches |
| Meta | Globale Helden-Tierliste; Klick öffnet Spielstil, Startwerte, Fähigkeiten, **Community-Builds mit Build-ID**, Top-Items, Counter/Synergien |
| Bestenliste | Podium, Region- und Helden-Filter, eigener Platz, Suche, Tracken per Klick |
| Einstellungen | **Steam-Anmeldung (OpenID)**, Abfrage-Takt, Historie im Hintergrund vervollständigen, Benachrichtigungen, Effekte, Dichte; Desktop: Tray, Autostart, Updates |
| Diagnose | Testet alle API-Endpunkte, zeigt Status, Rate-Limits und Fehler |

**Live-Erkennung:** `/v1/matches/active` zeigt laufende Matches. Endet eines, pollt der Server die Historie
einige Minuten im 5-s-Takt (sonst 20 s). Details (beide Teams, Ränge, Zeitreihen) werden ohne Steam-Fallback
geladen (Limit 3/h pro IP); frische Matches nutzen nach 3 Fehlversuchen höchstens 2 Steam-Abrufe pro Stunde.

## Design & Assets

Eigenes Logo (`app/icon.svg`), Aurora-Hintergrund in der Farbe des Main-Helden, Seitenübergänge (Aus-/Einblenden,
Fortschrittsbalken, gestaffelter Aufbau), neigbare Heldenkarten, animierte Zahlen. Heldenbilder/-namen und
Rang-Badges kommen von `api.deadlock-api.com/v1/assets/{heroes,ranks}` bzw. `/v1/assets/ranks/{tier}/{sub}/image`,
laufen über `/api/img` (Host-Allowlist, Platten-Cache, überstehen Offline-Phasen) und fallen bei Fehlern auf
eigene Grafiken zurück (Farbkachel mit Initialen, gezeichnetes Rang-Emblem).

## Desktop-Fenster

Eigene Titelleiste: Die System-Leiste entfällt, Minimieren/Maximieren/Schließen sitzen in der App-Leiste (`titleBarOverlay`). Taskleisten-/Installer-Icon: `build/icon.ico` (aus `app/icon.svg`, 16–256 px). Optional im Infobereich weiterlaufen (Tray), mit Windows starten, Windows-Benachrichtigungen – alles unter *Einstellungen → Desktop-App*.

**Steam-Anmeldung:** *Einstellungen → Mit Steam anmelden* nutzt Steam-OpenID. Der Tracker bekommt nur deine öffentliche Steam-ID; die Signatur wird per `check_authentication` bei Steam bestätigt. Profilbilder werden immer in der großen Variante (184 px) geladen.

## Auto-Update (Desktop)

Die installierte App (NSIS-Installer) prüft beim Start und alle 30 Minuten auf Updates (electron-updater, Quelle:
Release `dt-latest`), lädt sie im Hintergrund und zeigt „Neu starten & installieren“; ohne Klick wird beim Beenden
installiert. Der Workflow zählt die Version pro Build hoch (`0.1.<Run-Nummer>`) und aktualisiert `dt-latest`.
Die **portable EXE** kann sich nicht selbst aktualisieren. Voraussetzung: Das Repository bzw. die Releases müssen
öffentlich erreichbar sein.

## Windows-EXE

Der Workflow `.github/workflows/release-deadlock-tracker.yml` baut auf `windows-latest` einen Installer und eine
portable EXE (Electron + eingebetteter Next-Server inkl. Poller) und legt sie als Pre-Release `dt-v<version>` ab.
Start: Tag `dt-v*` pushen, Push auf `main`/`claude/**` (Änderungen in `deadlock-tracker/`) oder manuell über
*Actions → Run workflow*. Lokal unter Windows: `npm run dist:win` (Ausgabe in `release/`), zum Ausprobieren `npm run desktop`.
Daten liegen im Benutzerprofil (`%APPDATA%/Deadlock Tracker/store.json`). Die EXE ist nicht signiert.

## Wie Matches zuverlässig & schnell erkannt werden

1. **Server-Poller** (`instrumentation.ts`, Standard alle 20 s, `POLL_INTERVAL_S`) fragt die Match-Historie aller
   getrackten Accounts ab – unabhängig davon, ob ein Browser offen ist. Zusätzlich triggert die offene Seite Syncs
   (serverseitig dedupliziert).
2. **Zwei Stufen:** Sobald die Historie das Match enthält, wird es *sofort* mit Held, KDA und Ergebnis angelegt.
   Die vollständigen Daten beider Teams (Schaden, Ränge …) liefert Valve oft erst nach Minuten → werden mit
   Backoff (10 s → 15 min) nachgeladen, die Match-Seite aktualisiert sich selbst.
3. **Nichts geht verloren:** Jeder Lauf gleicht die *komplette* Historie idempotent per `match_id` ab. Ein API-Ausfall,
   Neustart oder verpasster Poll holt beim nächsten erfolgreichen Lauf alles nach (siehe `lib/sync.test.ts`).
   Fehler werden im UI angezeigt, nicht verschluckt.
4. Das Dashboard zeigt pro live erkanntem Match, wie viele Sekunden nach Spielende es erkannt wurde.

Persistenz: `data/store.json` (atomar geschrieben). Der Poller braucht einen dauerhaft laufenden Node-Server
(kein Serverless); sonst greift nur das Polling durch die offene Seite.

## Rating (Noten S–F)

Die Note ist **rollenbewusst** und **vollständig erklärbar** (Match-Seite → „Warum diese Note?“, für jeden Spieler per Klick auf die Note).

1. **Rolle aus dem Verhalten:** Support (viel Heilung/Schilde für Mitspieler), Frontline (viel erlittener/verhinderter Schaden bei wenig eigenem Schaden), Objective-Fokus, Carry (überdurchschnittlicher Schaden) oder Flex – nicht aus dem Helden.
2. **Fairer Vergleich:** Jeder Baustein wird mit Spielern *gleicher Rolle* (beider Teams) und der restlichen Lobby verglichen. Ein Support ohne Kills wird bei Kills/Schaden mit anderen Supports verglichen, nicht mit Carries.
3. **Rollen-Gewichte:** Support zählt vor allem Unterstützung, Beteiligung, Überleben; Carry Kampf, Wirtschaft, Überleben, Lane usw. (`ROLE_WEIGHTS` in `lib/rating.ts`). Nicht anwendbare Bausteine (z. B. fehlende Lane-Daten) fallen weg, die Gewichte werden neu verteilt.
4. **Bausteine:** Kampf (Schaden/Min), Support/Frontline, Beteiligung ((K+A)/Team-Kills), Überleben (Tode/Min), Wirtschaft (Souls/Min), Objectives, Lane (Souls nach 8:00 gegen den Lane-Gegner).
5. **Skala:** logarithmisch (doppelt so gut = symmetrisch zu halb so gut), Sieg/Niederlage ±0.04, kurze Matches werden zum Durchschnitt hin gedämpft, Abbrecher = F.
6. **Noten:** S ≥ 1.30 · A ≥ 1.14 · B ≥ 0.97 · C ≥ 0.83 · D ≥ 0.69 · sonst F.

Abgesichert durch eine Balance-Simulation (`lib/rating.test.ts`): bei gleichem Können erreichen Carry, Support, Frontline und Flex im Schnitt denselben Score und gleich oft S bzw. F.

## Datenquelle & Stand der Verifikation

Quelle: Community-API [deadlock-api.com](https://deadlock-api.com). Die Parser sind gegen die **OpenAPI-Spec**
(`deadlock-api/openapi-clients`) und die **Valve-Protobufs** (`SteamDatabase/Protobufs`) geprüft und in
`lib/api/normalize.test.ts` mit spezifikationsgetreuen Beispieldaten abgesichert (u. a. `player_match_outcome`,
`ranked_display_badge`, `player_rank_data.initial_display_rank`, `match_mode`/`game_mode` als Zahlen).
**Nicht getestet** ist der echte HTTP-Verkehr: die Entwicklungsumgebung konnte `api.deadlock-api.com` nicht erreichen.
Die globalen Seiten (Meta, Bestenliste) zeigen bei API-Fehlern eine Fehlermeldung statt abzustürzen.

## Tests

`npm test` (Rating, Rang-Mittelung, Steam-ID-Parsing, Sync-Engine inkl. API-Ausfall und Backoff), `npm run typecheck`.
