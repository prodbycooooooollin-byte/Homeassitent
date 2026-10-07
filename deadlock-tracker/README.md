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

Daten kommen von der Community-API [deadlock-api.com](https://deadlock-api.com)
(`/v1/players/{id}/match-history`, `/v1/matches/{id}/metadata`, `/v1/players/steam`, Assets für Heldennamen).
**Achtung:** In der Entwicklungsumgebung war diese Domain gesperrt – Endpunkte und Feldnamen sind aus der
Kenntnis der API implementiert und **noch nicht gegen die Live-API getestet**. Die Parser
(`lib/api/normalize.ts`) sind tolerant; falls Felder abweichen, ist nur diese Datei anzupassen.

## Tests

`npm test` (Rating, Rang-Mittelung, Steam-ID-Parsing, Sync-Engine inkl. API-Ausfall und Backoff), `npm run typecheck`.
