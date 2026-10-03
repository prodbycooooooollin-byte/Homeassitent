# Architektur & Sicherheit

## Überblick

```
Desktop (Electron)                         Server (Node/Socket.IO)                 TikTok
┌──────────────────────────────┐   WSS    ┌──────────────────────────────┐
│ Renderer (React, sandboxed)  │◀────────▶│ RoomManager → Room            │
│  - Screens, Sounds, Player ──┼──────────┼──(nur IDs, Zustände, Stimmen) │
│  - TikTok-Embed-iframe ──────┼──────────┼──────────────────────────────┼──▶ Embed Player (Video direkt)
│ Preload (contextBridge)      │          │ MatchEngine (game-core)       │
│ Main (IPC-Validierung,       │  HTTPS   │ TikTokAuthService (getrennt)  │──▶ Login Kit / Data Portability
│  Store, DPAPI, Updater)  ────┼─────────▶│  verschlüsselter Tokenstore   │
└──────────────────────────────┘          └──────────────────────────────┘
```

## Spielablauf (Server ist verbindlich)

Zustandsmaschine (`packages/game-core/src/phases.ts`):
`LOBBY → PREPARING → COUNTDOWN → PLAYING_AND_VOTING → REVEAL → SCOREBOARD → PREPARING | RESULTS`,
dazu Annullierung/Ersatz `PREPARING|COUNTDOWN|PLAYING → PREPARING` und Abbruch `* → RESULTS | LOBBY`.
Jeder Übergang wird geprüft (`assertTransition`); jede Änderung erhöht `version`.

- **PREPARING:** Der Server wählt den nächsten Clip aus der Blockplanung (ein Clip je Person pro Block, gemischt,
  kein Besitzer direkt zweimal hintereinander) und vergibt eine neue Round-ID. Clients laden den Player und melden
  `ready`/`failed`. Nach einem Timeout (12 s) oder Fehler folgt ein Retry (8 s), danach ein Ersatzclip derselben Quelle.
- **COUNTDOWN:** `startAt = jetzt + 3 s` (Serverzeit). Clients rechnen mit dem Uhrenabgleich (min-RTT aus 5 Pings,
  alle 20 s erneuert) auf Lokalzeit um und senden dann `play`.
- **PLAYING_AND_VOTING:** Stimmen werden nur zwischen `startAt` und `deadline` angenommen. Die Frist bestimmt die
  Servereingangszeit. Stimmen sind idempotent (Voting-ID; Wiederholungen liefern die bereits bestätigte Stimme).
  Haben alle abgestimmt, endet die Runde 1,2 s später. **Fairness-Prüfung:** Wer zum Start verbunden war und nach
  2,5 s noch keinen Wiedergabestart gemeldet hat, führt zur Annullierung. Das gilt auch für Buffering über 3 s am
  Stück, über 5 s insgesamt oder einen Playerfehler. Die Annullierung ist neutral: keine Punkte, keine
  Streak-Änderung, keine Enthüllung, der Ersatz kommt vom selben Besitzer. Die Toleranzen sind **nicht** mit echten
  TikTok-Streams kalibriert (siehe TEST_REPORT).
- **REVEAL/SCOREBOARD:** Die Wertung läuft genau einmal (`finishRound` ist idempotent). Der Host darf nur im
  Zwischenstand pausieren (max. 2 min).
- **Ausscheiden:** Nach 30 s ohne Reconnect wird der laufende Block inklusive Streaks zurückgerollt. Gewertet wird
  mit den abgeschlossenen Blöcken; gibt es keinen, geht es zurück zur Lobby. Neue Personen warten bis zur Lobby.
  Der Host wechselt automatisch.
- Ersatzversuche sind begrenzt (3 × Spielerzahl), damit es keine Endlosschleifen gibt.

## Wertung

`basePoints = round(1000 − 300·(r−1)/(m−1))`, m = Abstimmungsberechtigte zu Rundenbeginn, r = Rang nur unter
richtigen Tipps. Gleicher Rang gilt innerhalb einer 80-ms-Gruppe ab Rundenstart (Servereingang). Das verringert
Ping-Unterschiede, beseitigt sie aber nicht. Streak-Multiplikator ×1,00/1,05/1,10/1,15, als ganzzahlige Prozent
gerechnet: `round(base·pct/100)`. Eigener Clip und annullierte Runde lassen die Streak unverändert. Endwertung:
Punkte, dann richtige Antworten, sonst geteilter Platz. Titel werden nur bei eindeutigem Spitzenwert vergeben.

## Geheimhaltung

`apps/server/src/rooms/view.ts` baut **pro Spieler** eine Sicht aus explizit ausgewählten Feldern. Interne
Modelle werden nie serialisiert. Vor der Auflösung enthält keine Sicht Besitzer, Lösung oder fremde Stimmen.
Nur der Besitzer erhält `role: 'owner'`, alle anderen dieselbe öffentliche Sicht; Stimmen erscheinen nur als
anonyme Anzahl. Ein automatisierter Test vergleicht in jeder Rundenversion die öffentlichen Teile aller vier
Sichten auf Gleichheit.

## Netzwerk & Basisschutz

- Alle Client-Nachrichten werden mit zod validiert (Größen, Formate, erlaubte Werte). `maxHttpBufferSize` beträgt 96 KB.
- Rate-Limits: je Socket (80/15 s⁻¹), je Ereignistyp (20/4 s⁻¹) und für Beitritt/Erstellen je IP (10, dann 1 pro 6 s).
  Mit `TRUST_PROXY` wird `X-Forwarded-For` berücksichtigt.
- Raumcode: 6 Zeichen aus 32 (≈ 10⁹). Der **Reconnect-Token** ist separat und zufällig (32 Byte); gespeichert wird
  nur sein SHA-256.
- Obergrenzen: 8 Spieler, 60 Kandidaten, 3 000 Index-Hashes, `MAX_ROOMS`, Ersatzversuche, Pausendauer, Raum-TTL.
- Der Server lädt keine vom Client angegebenen URLs. Embed-URLs entstehen nur aus validierten numerischen IDs.
- Ehrliche Grenze: Es handelt sich um ein privates Freundesspiel mit serverseitiger Wertung. Ob importierte IDs
  tatsächlich gelikt wurden, kann der Server ohne unabhängige Quelle nicht beweisen, und manipulierte Clients können
  Wiedergabemeldungen fälschen. Vollständige Betrugssicherheit besteht nicht.

## Electron-Sicherheit

- Renderer: `sandbox`, `contextIsolation`, kein `nodeIntegration`, `webSecurity`; geladen über das privilegierte,
  sichere Schema `app://liked` mit Schutz vor Pfad-Traversal. Die CSP erlaubt Frames nur von `https://www.tiktok.com`.
- Fenster öffnen und Navigation weg von `app://liked` sind blockiert, ebenso `webview`. Berechtigungen: nur Vollbild.
- IPC: nur benannte Kanäle über `contextBridge`. Der Hauptprozess prüft Absender (Hauptframe, eigener Origin) und
  validiert jede Eingabe mit zod. `openExternal` gilt nur für eine Allowlist.
- Electron-Fuses: `runAsNode` aus, `NODE_OPTIONS`/Inspect aus, ASAR-Integrität an, nur aus ASAR laden.
- Der experimentelle TikTok-Webadapter nutzt ein eigenes Fenster mit eigener Partition, Sandbox und ohne Preload.

## Ressourcen

Pro Runde gibt es genau ein Player-iframe (Schlüssel = Round-ID + Ladeversuch). Beim Rundenwechsel wird es entfernt,
und Timer bzw. Listener werden in Effekt-Cleanups abgebaut. Auf dem Server verwaltet jeder Raum seine Timer zentral
(`timerCount` wird getestet). Die Hintergrundanimation pausiert bei verstecktem Fenster, Chromium drosselt das Rendering
im Hintergrund, und bei reduzierter Bewegung oder niedriger Effektqualität entfallen Partikel.
