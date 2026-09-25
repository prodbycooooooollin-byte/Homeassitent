# Architektur

```
┌──────────────────────── ON AIR (ein Prozess, Einzelinstanz) ────────────────────────┐
│  React-UI (Hauptfenster, Kompaktfenster)      ← Snapshots (gebündelt, 120 ms)        │
│        │ invoke (Tauri-Befehle, dünne Schicht)                                        │
│  src-tauri: Tray · Schließen/Beenden · Autostart · Credential Manager · Logs · Hotkey │
│             Updater (tauri-plugin-updater, signierte GitHub-Releases)                 │
│        │                                                                              │
│  onair-core::runtime (einmal erzeugt)                                                 │
│   ├─ spotify::service  ── genau 1 Polling-Worker ──► SpotifyState (watch)             │
│   │     └─ spotify::client ── auth::TokenManager (Single-Flight-Refresh, Epoche)      │
│   ├─ twitch::service   ── genau 1 EventSub-Verbindung + 1 Chat-Sender                 │
│   ├─ twitch::rewards   ── eigene Kanalpunkte-Belohnung, Einlösungen abwickeln         │
│   ├─ acceptance + plan ── Sperrgründe je Weg, Zeitbudget bis Streamende               │
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

## Annahme: Sperrgründe statt Schalter (`acceptance.rs`)

Ob ein Weg (Chat, Kanalpunkte) Requests annimmt, wird **abgeleitet**, nicht gespeichert.
Jeder Weg hat eine Liste von Sperrgründen:

| Grund | Quelle | Aufgehoben durch |
|---|---|---|
| `manual_pause` | globaler Schalter „Requests annehmen“ | nur den Schalter |
| `source_disabled` | Weg in den Einstellungen aus | Einstellung |
| `stream_ended` | Streamplanung: Endzeit erreicht | neue Endzeit / Planung beenden |
| `budget_exhausted` | Streamplanung: kein Mindestslot (60 s) mehr frei | Verlängern, Requests entfernen |
| `plan_uncertain` | Prognose unsicher (nur **Kanalpunkte**) | Wiedergabe bestätigt |
| `update_pause` | Update-Vorbereitung | Installation abgebrochen |
| `reconciling` | Kanalpunkte: Abgleich nach Start | Abgleich fertig |
| `technical` | fehlende Berechtigung, kein Affiliate … | Ursache behoben |

Weil die Gründe getrennt sind, hebt z. B. „+15 Minuten“ eine manuelle Pause **nicht** auf.
Chat- und Kanalpunkte-Requests laufen durch **dieselbe** Pipeline (`QueueService::submit…`,
Regeln, Moderation, Übergabe); die Kanalpunkte-Quelle überspringt nur Rollen- und Cooldown-Regeln
des Chats und nutzt eigene Limits.

## Streamplanung (`plan.rs`)

```
frei = verbleibend − Rest des aktuellen Titels − geplante Requests − reservierte − Puffer
```

- Prüfung und Reservierung passieren unter derselben Sperre wie die Annahmeentscheidung →
  zwei gleichzeitige Requests können nicht dasselbe Restbudget belegen.
- Zu lange Songs werden mit konkreter Begründung abgelehnt („dein Song dauert 5:12; aktuell
  passen voraussichtlich noch 3:40 hinein“).
- Unsicherheit (pausiert, Titel wiederholen, unbekannte Dauer, unbestätigte Wiedergabe,
  unklare Übergabe) wird benannt; bezahlte Requests werden dann zurückgehalten.
- Endzeit wird in SQLite gespeichert; ein abgelaufenes Streamende bleibt nach Neustart geschlossen.
- Überplanung (z. B. nach manuellem Verlängern des aktuellen Titels) wird angezeigt, mit Angeboten:
  verlängern, Requests auswählen, weiterlaufen lassen.

## Kanalpunkte (`twitch/rewards.rs`)

- ON AIR legt eine **eigene** Belohnung an (nur so darf dieselbe Client-ID Einlösungen erfüllen/stornieren).
  Die ID wird gespeichert; nach einem Absturz wird eine Belohnung gleichen Titels übernommen statt dupliziert.
- Ausschalten → Belohnung wird deaktiviert (nicht gelöscht). Die UI zeigt „ausstehend“, bis Twitch bestätigt.
- Einlösung → Request mit `redemption_id` (eindeutiger Index = Deduplizierung).
- Zielzustand: Titel läuft (beobachtet) → `FULFILLED`; abgelehnt/fehlgeschlagen → `CANCELED`
  (Twitch erstattet); abgeschlossen ohne Beobachtung → **Prüfung** durch dich.
  „Erstattet“ erscheint erst nach Bestätigung durch Twitch.
- Start: erst Abgleich offener Einlösungen (`GET …/redemptions?status=UNFULFILLED`), dann Annahme.
- Beim geordneten Beenden wird die Belohnung pausiert.

## Updater

Siehe [UPDATES.md](UPDATES.md). Zustände liegen in `update_state.rs` (Kern, getestet);
`src-tauri/src/updater.rs` verbindet sie mit dem Plugin. Vor der Installation:
Update-Sperre setzen, Belohnung pausieren, auf ruhende Queue warten, SQLite-Checkpoint.
`UpdateManager::run_auto` ist die Hintergrund-Automatik (prüfen → laden → sicherer Moment →
30-s-Countdown → installieren); die Entscheidung trifft die reine Funktion
`update_state::decide_auto_install`.
