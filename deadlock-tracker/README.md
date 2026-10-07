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
| Übersicht | Player Card (Steam-Profil, Main-Held, Rang, Winrate), **Live-Match-Banner**, Kennzahlen, letzte Matches, Rang, Leistungsverlauf, Form, Top-Helden |
| Matches | Alle Matches mit Filtern (Ergebnis, Modus, Held), Sortierung, Tagesgruppen |
| Match | Vollständige Summary beider Teams, Note, Ø Lobby-Rang, Teamvergleich, Rating-Aufschlüsselung |
| Helden | Eigene Helden-Statistik als Karten, Detailseite je Held |
| Rang | Aktueller Rang, Peak, Rangverlauf-Diagramm |
| Mitspieler | Stammspieler mit Winrate (aus allen Matches mit Details) |
| Meta | Globale Helden-Tierliste (Winrate/Pickrate, Ranked, 14 Tage) |
| Bestenliste | Leaderboard je Region |
| Suche (Top-Bar) | Spielersuche per Name (Steam-Profile) oder ID, direkt tracken |

**Live-Erkennung:** `/v1/matches/active` zeigt laufende Matches. Endet eines, pollt der Server die Historie
einige Minuten im 5-s-Takt (sonst 20 s) – das neue Match erscheint so meist Sekunden nach dem Eintrag in der API.

## Design & Assets

Eigenes Logo (`app/icon.svg`), Aurora-Hintergrund in der Farbe des Main-Helden, Seitenübergänge (Aus-/Einblenden,
Fortschrittsbalken, gestaffelter Aufbau), neigbare Heldenkarten, animierte Zahlen. Heldenbilder/-namen und
Rang-Badges kommen von `api.deadlock-api.com/v1/assets/{heroes,ranks}` bzw. `/v1/assets/ranks/{tier}/{sub}/image`,
laufen über `/api/img` (Host-Allowlist, Platten-Cache, überstehen Offline-Phasen) und fallen bei Fehlern auf
eigene Grafiken zurück (Farbkachel mit Initialen, gezeichnetes Rang-Emblem).

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

## Rating

Gewichteter Mittelwert relativ zum Lobby-Durchschnitt (1.00 = Schnitt): KDA 25 %, Kill-Beteiligung 15 %,
Souls/Min 20 %, Schaden bzw. Heilung 30 % (Heiler werden nicht bestraft), Objective-Schaden 10 %, ±0.05 für
Sieg/Niederlage. Noten: S ≥ 1.45, A ≥ 1.20, B ≥ 0.95, C ≥ 0.75, D ≥ 0.55, sonst F; Abbrecher = F.
Das ist eine eigene Heuristik (`lib/rating.ts`), nicht der statlocker-Algorithmus.
Ø Lobby-Rang = Mittel der Team-Badges (linear über Tier/Subtier gemittelt).

## Datenquelle & Stand der Verifikation

Quelle: Community-API [deadlock-api.com](https://deadlock-api.com). Die Parser sind gegen die **OpenAPI-Spec**
(`deadlock-api/openapi-clients`) und die **Valve-Protobufs** (`SteamDatabase/Protobufs`) geprüft und in
`lib/api/normalize.test.ts` mit spezifikationsgetreuen Beispieldaten abgesichert (u. a. `player_match_outcome`,
`ranked_display_badge`, `player_rank_data.initial_display_rank`, `match_mode`/`game_mode` als Zahlen).
**Nicht getestet** ist der echte HTTP-Verkehr: die Entwicklungsumgebung konnte `api.deadlock-api.com` nicht erreichen.
Die globalen Seiten (Meta, Bestenliste) zeigen bei API-Fehlern eine Fehlermeldung statt abzustürzen.

## Tests

`npm test` (Rating, Rang-Mittelung, Steam-ID-Parsing, Sync-Engine inkl. API-Ausfall und Backoff), `npm run typecheck`.
