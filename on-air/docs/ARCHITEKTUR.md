# Architektur

```
┌──────────────────────── ON AIR (ein Prozess, Einzelinstanz) ────────────────────────┐
│  React-UI (Hauptfenster, Kompaktfenster)      ← Snapshots (gebündelt, 120 ms)        │
│        │ invoke (Tauri-Befehle, dünne Schicht)                                        │
│  src-tauri: Tray · Schließen/Beenden · Autostart · Credential Manager · Logs · Hotkey │
│        │                                                                              │
│  onair-core::runtime (einmal erzeugt)                                                 │
│   ├─ spotify::service  ── genau 1 Polling-Worker ──► SpotifyState (watch)             │
│   │     └─ spotify::client ── auth::TokenManager (Single-Flight-Refresh, Epoche)      │
│   ├─ twitch::service   ── genau 1 EventSub-Verbindung + 1 Chat-Sender                 │
│   ├─ queue::service    ── Regeln, Moderation, Übergabe, Beobachtung, Abgleich         │
│   ├─ storage (SQLite, WAL, Migrationen + Sicherung)                                   │
│   ├─ overlay (axum, nur 127.0.0.1) ◄── OverlayData (watch) ◄── overlay_feeder         │
│   └─ wake (Standby-Erkennung) → gezielte Wiederherstellung                            │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

UI-Komponenten enthalten keine Fachlogik; sie lesen Snapshots und rufen Befehle auf.
Widgets und Tray lesen denselben Zustand – es gibt keine zusätzlichen Spotify-Abfragen.

## Zustandsmodell Spotify

Drei unabhängige Dimensionen:

| Dimension | Werte |
|---|---|
| Authentifizierung | `signed_out` · `signed_in` · `reauth_required` |
| Erreichbarkeit | `unknown` · `online` · `degraded` · `offline` · `rate_limited` · `quota_exhausted` · `blocked` |
| Gerät | `unknown` · `no_active_device` · `active` |

Wiedergabe: `unknown` (noch keine Antwort) · `idle` (HTTP 204, legitimer Zustand) · `active`.

## Fehlerbehandlung

| Situation | Verhalten (Code) |
|---|---|
| HTTP 401 | `TokenManager::on_unauthorized` – genau ein Refresh für alle gleichzeitigen Aufrufer; die Operation wird **einmal** wiederholt (ein 401 wurde nicht ausgeführt). |
| HTTP 403 | Klassifiziert (`PREMIUM_REQUIRED`, nicht freigeschalteter Nutzer, sonstiges). Link-Zustand `blocked`, nur noch alle 10 min bzw. bei „Verbindung prüfen“. |
| HTTP 429 | `Retry-After` global (Rate-Gate); bis dahin verlassen keine Spotify-Anfragen die App. ≥ 10 min → „Kontingent erschöpft“. |
| Timeout, DNS, 5xx | Tokens bleiben. Lesezugriffe: max. 2 Wiederholungen (0,4 s / 1,2 s). Worker: Backoff 2 s … 120 s mit Zufallsanteil, Circuit Breaker (4 Fehler → 30 s offen → eine Probe). |
| 204 / kein Gerät | Anmeldung bleibt, Status „kein aktives Gerät“, Handlungsangebot „Spotify öffnen“/„Gerät wählen“. |
| `invalid_grant` | Tokens verworfen, `reauth_required`, keine Refresh-Schleife; Queue und Einstellungen bleiben. |
| Abmelden | Epoche +1; verspätete Antworten (auch laufende Refreshes) werden verworfen. |

Schreibende Operationen werden nur wiederholt, wenn der Transport nachweislich nicht
gesendet hat (`Connect`-Fehler). Timeouts und 500/502/504 gelten als **unklarer Ausgang**.

## Request-Zustandsautomat

```
received ─► pending_review ─(Freigabe / Spotify wieder erreichbar)─► accepted
   │              │                                                      │
   └──► rejected ◄┘                                         (Write-Ahead) ▼
                                                                    handing_off
                                   Timeout/5xx/Absturz ─► uncertain ◄──┤ 2xx
                                        │ Abgleich: in Spotify-Queue?   ▼
                                        ├─ ja ─────────────────────► handed_off
                                        └─ nein → Entscheidung              │ Titel läuft
                                           (erneut übergeben / erledigt)    ▼
                                                                          playing ─► completed
```

- Statuswechsel sind Compare-and-Set in SQLite – ein veralteter Vorgang überschreibt nie einen neueren Zustand.
- Event-Deduplizierung und Anlage des Requests passieren in **einer** Transaktion (`processed_events`).
- Übergabe nur, wenn Spotify online ist, ein aktives, nicht eingeschränktes Gerät existiert und der letzte bestätigte Zustand < 15 s alt ist (nie nach Standby mit alten Daten).
- Höchstens `handoff_ahead` (Standard 1) Titel liegen gleichzeitig in Spotifys Queue; der Rest bleibt lokal sortierbar.
- Beobachtung: Läuft ein übergebener Titel, wird er `playing`; früher übergebene, nie gesehene Titel werden `completed` mit Grund „nicht beobachtet“ (Spotify spielt die Queue in Reihenfolge).
- Manuelles Skippen, Pause, Shuffle, Gerätewechsel: ON AIR folgt dem beobachteten Zustand und greift nicht in die Wiedergabe ein.
- Nach einem Absturz: `handing_off` → `uncertain` → Abgleich mit `GET /me/player/queue`. Nie die ganze Queue erneut senden.

## Twitch EventSub

- Frische Verbindung: Welcome → Abo `channel.chat.message` (409 = existiert bereits, kein Duplikat).
- `session_reconnect`: neue Verbindung zur `reconnect_url`, Welcome abwarten, dann alte schließen; **kein** neues Abo.
- Watchdog: keine Nachricht innerhalb `keepalive_timeout_seconds + 5 s` → frische Verbindung mit Backoff.
- `revocation`: `authorization_revoked` → Abmeldung und gezielte Loginaufforderung; sonst `blocked`.
- Doppelte Zustellungen: `metadata.message_id` im Speicher, Chat-Message-ID dauerhaft in SQLite.
- Eigene Chatantworten werden anhand ihrer Message-ID ignoriert (keine Schleifen).
- Token-Validierung beim Start und stündlich.

## Overlay-Server

- Bindet ausschließlich an `127.0.0.1`, `Host`-Header-Prüfung gegen DNS-Rebinding, keine CORS-Header.
- Lesend: `/widget/{minimal|glass|queue}`, `/api/state`, `/api/events` (SSE mit 5-s-Herzschlag).
- Schreibend: `POST /api/control/{skip|open_requests|close_requests}` – standardmäßig aus; verlangt `X-OnAir-Token` (Vergleich in konstanter Zeit) und lehnt Anfragen mit `Origin`-Header ab.
- Widgets blenden aus, wenn Daten älter als die konfigurierte Frist sind oder der Server > 12 s schweigt; `EventSource` verbindet nach App-Neustart selbstständig neu.

## Speicherung

| Was | Wo |
|---|---|
| Tokens (Spotify, Twitch), Steuer-Token | Windows Credential Manager (`keyring`, ein Eintrag pro Schlüssel) |
| Einstellungen, Profile, Requests, Verlauf, Aktivität, Sperrliste | `%APPDATA%\app.onair.desktop\onair.db` (SQLite, WAL) |
| Sicherungen vor Migrationen | `…\backups\onair-v{N}-{Zeit}.db` |
| Logs | `%LOCALAPPDATA%\app.onair.desktop\logs\onair.*.log` (täglich, max. 7 Dateien) |

Aufbewahrung: Aktivität max. 2000 Einträge, verarbeitete Event-IDs 7 Tage, Verlauf 180 Tage.
