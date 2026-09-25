# Teststatus

**Wichtig:** Alle automatisierten Tests laufen gegen **kontrollierte Fake-Provider** bzw. ein
Beispiel-Backend. Sie sind **simuliert** und ersetzen keine Live-Smoke-Tests mit echten
Konten und keinen realen Langzeittest.

## Ausführen

```bash
cd on-air
cargo test -p onair-core            # Rust: Unit-, Abnahme- und Overlay-Tests
npm run typecheck                   # TypeScript
npx playwright test                 # UI-Layouttests (Browser-Vorschau)
```

Werden die Rust-Tests mit pausierter Tokio-Zeit ausgeführt, laufen auch „2 Minuten Ausfall“
oder „600 s Sperre“ in Sekundenbruchteilen – die Zeitlogik ist dieselbe wie im Betrieb.

## Abnahmekriterien (Abschnitt 10) – simuliert

| Kriterium | Test (`crates/onair-core/tests/acceptance.rs`) | Status |
|---|---|---|
| Access Token läuft während Nutzung ab, Queue bleibt | `token_expiry_during_use_keeps_queue` | ✅ bestanden |
| Viele gleichzeitige Anfragen → genau ein Refresh (401-Fall und Ablauf-Fall) | `concurrent_requests_share_one_refresh` | ✅ |
| Refresh ohne neuen Refresh Token behält den alten | `refresh_without_new_refresh_token_keeps_old_one` | ✅ |
| 2 Minuten Internetausfall: kein Logout, ≤ 25 Anfragen, kontrollierte Wiederaufnahme | `two_minute_outage_no_logout_and_bounded_requests` | ✅ |
| Standby/Aufwachen: Erholung ohne doppelte Worker (Polling-Rate unverändert nach 5× Wiederherstellung) | `wake_recovery_does_not_duplicate_workers` | ✅ (Wanduhr-Sprungerkennung separat unit-getestet) |
| Spotify geschlossen / Gerätewechsel: korrekter Status statt Login | `spotify_closed_or_device_changed_is_not_a_logout` | ✅ |
| HTTP 429 / Kontingent: Pause eingehalten, 0 Anfragen während Retry-After | `rate_limit_is_respected` | ✅ |
| 5xx: begrenzte Wiederholungen (genau 1+2), Tokens bleiben; Refresh-5xx/Netzfehler löschen nichts | `transient_5xx_limited_retries_tokens_kept` | ✅ |
| `invalid_grant`: gezielte Loginaufforderung, keine Refresh-Schleife, Daten bleiben | `invalid_grant_requests_login_and_keeps_data` | ✅ |
| Twitch-Event doppelt: ein Request, eine Antwort | `duplicate_twitch_event_creates_one_request_and_one_reply` | ✅ |
| Absturz nach Übergabe vor Bestätigung: Abgleich statt erneutem Senden; Entscheidung, wenn nicht auffindbar | `crash_after_handoff_is_reconciled_not_resent` | ✅ |
| Unklarer Ausgang zur Laufzeit wird nicht wiederholt | `ambiguous_handoff_is_not_retried` | ✅ |
| App-Neustart: Einstellungen, Requests, Overlay-Server | `restart_restores_settings_requests_and_overlay` | ✅ |
| Abmelden während laufender Anfragen/Refresh: keine Wiederbelebung | `logout_during_requests_does_not_revive_session` | ✅ |
| Offline-Requests nur „Prüfung ausstehend“ | `offline_requests_are_pending_until_spotify_returns` | ✅ |
| Sparsame Übergabe + Beobachtung | `handoff_is_sparse_and_playback_is_observed` | ✅ |
| Limits bei gleichzeitigen Requests | `concurrent_requests_respect_user_limit` | ✅ |
| Overlay: Loopback, Host-Prüfung, Token, keine Secrets | `tests/overlay.rs` | ✅ |
| UI: kleines Fenster, lange Namen, 100/125/150/200 %, 1280×720, 1920×1080 | `tests-ui/layout.spec.ts` (42 Tests) | ✅ in Chromium, **nicht** in WebView2 geprüft |

## Erweiterung 0.2 – simuliert

| Anforderung | Test (`crates/onair-core/tests/extensions.rs`, Fake-Spotify + Fake-Twitch) | Status |
|---|---|---|
| Chat/Kanalpunkte unabhängig (4 Kombinationen), globale Pause überlagert beide | `four_source_combinations_and_global_pause` | ✅ |
| Belohnung wird einmal angelegt, ID gespeichert, nach Absturz übernommen statt dupliziert | `reward_is_created_once_and_adopted_after_crash` | ✅ |
| Ausschalten deaktiviert (nicht löschen), „ausstehend“ bis Twitch bestätigt | `disabling_shows_pending_until_twitch_confirms` | ✅ |
| Doppelte Einlösung → ein Request; Erfüllen erst nach beobachtetem Start; Ablehnen storniert | `redemptions_are_deduplicated_and_settled` | ✅ |
| Neustart: offene Einlösungen werden vor neuer Annahme abgeglichen | `restart_recovers_pending_redemptions` | ✅ |
| Gleichzeitige Requests teilen sich kein Restbudget (atomare Reservierung) | `concurrent_requests_cannot_share_the_same_budget` | ✅ |
| Zu langer Song: konkrete Begründung mit Dauer und Restzeit | `too_long_request_gets_concrete_reason` | ✅ |
| +15 Min hebt manuelle Pause nicht auf; Endzeit übersteht Neustart; abgelaufenes Ende bleibt zu | `extension_keeps_manual_pause_and_restart_keeps_end` | ✅ |
| Prognose folgt Pause, Skip und Spulen; Pause wird als Unsicherheit benannt | `plan_follows_pause_skip_and_seek` (+ Unit-Test `paid_requests_held_back_when_plan_uncertain`) | ✅ |
| Update-Vorbereitung pausiert Requests/Belohnung, sichert DB; Abbruch stellt Annahme wieder her | `update_preparation_pauses_and_can_be_cancelled` | ✅ |

Unit-Tests dazu: Budgetformel und Unsicherheitscodes (`plan.rs`), Sperrgründe inkl.
„+15 hält manuelle Pause“ (`acceptance.rs`), Update-Zustände und Fehlerklassifizierung – ein
fehlgeschlagener Check ist nie „aktuell“; automatische Installation nie während Live/Planung/Übergabe, sofort nach Start, sonst erst nach 10 min Wiedergabepause (`update_state.rs`), EventSub-Einlösungsnachrichten.

UI (Playwright, Browser-Vorschau): Übersicht bei 1280×720/1920×1080 ohne abgeschnittene
Kopfzeilen, globale Pause lässt Wege-Einstellungen unverändert, nur Kanalpunkte aktiv,
Schnellwahl/+15/Planung beenden, abgelaufenes Streamende, Überplanungs-Angebot, Update
„nicht eingerichtet“ ≠ „aktuell“, Download → bereit → Bestätigungsdialog, Tastatur in den
Einstellungen, Werbung/veraltete Daten ohne widersprüchliche Zeiten.

OBS-Overlays: Quelltext (`overlay/`, `widget.rs`) und Aufbau der Overlay-Daten seit 0.1
unverändert; die App-Styles werden vom Overlay-Server nicht ausgeliefert. Ein Pixelvergleich
war wegen Einblend-Animationen nicht deterministisch und wurde nicht als Nachweis gewertet.

Zusätzlich 21 Unit-Tests (PKCE nach RFC 7636, Backoff/Circuit Breaker, Regeln, Chatbefehle,
EventSub-Protokoll inkl. Reconnect ohne Neuabo, Migrationen, atomare Textdatei, Anonymisierung).

## Nicht durchgeführt

- Live-Smoke-Test mit echtem Spotify-Premium-Konto und Twitch-Kanal.
- Manueller Test der Windows-Build-Artefakte (Tray, Autostart, Credential Manager, echtes Standby).
- **Achtstündiger realer Dauertest** – noch nicht durchgeführt, keine Messwerte vorhanden.
- Echter Kanalpunkte-Durchlauf mit Affiliate-Konto.
- Echter Update-Durchlauf auf Windows (0.2.0 → 0.2.x) – setzt hinterlegte Signatur-Secrets voraus.
  Durchgeführt wurde ein **lokaler End-to-End-Lauf unter Linux** mit der echten Desktop-App:
  Wegwerf-Schlüssel, lokaler Update-Server, signiertes Testpaket. Geprüft: automatische Suche
  → Download → Signaturprüfung (ohne Versionsbindung korrekt abgewiesen, mit Versionsbindung
  angenommen) → Countdown → „Nicht jetzt“ → nach Neustart automatische Installation mit
  Update-Vorbereitung (Requests pausiert, DB gesichert) → Paket installiert, App beendet sich
  zum Neustart. Dabei gefunden und behoben: Überlauf in der Live-Status-Zwischenspeicherung.

## Plan: achtstündiger Dauertest

Bedingungen dokumentieren: Windows-Version, CPU/RAM, ON-AIR-Version, Netzwerk (LAN/WLAN),
OBS-Version und Anzahl Browser-Quellen, Abfrage-Intervall.

1. ON AIR installieren, Spotify + Twitch verbinden, OBS mit allen drei Widgets öffnen.
2. `scripts\soak-monitor.ps1 -Hours 8` starten (CPU %, Working Set, Private Bytes, Handles, Threads pro Minute).
3. Eine Playlist mit kurzen Titeln (2–3 min) laufen lassen → ~180 Titelwechsel.
4. Stündlich 3 Requests per `!sr` aus einem Zweitkonto, davon einer per Link, einer doppelt gesendet.
5. Netzunterbrechungen: nach 1 h 2 min WLAN aus, nach 3 h 10 min, nach 5 h Netzwerkwechsel (LAN↔WLAN),
   nach 6 h 20 min Standby. Jeweils Zeitpunkt bis Status „Verbunden“ und Widget wieder sichtbar notieren.
6. Am Ende: Diagnosebericht speichern (enthält API-Aufrufzähler, Rate-Limit- und Fehlerzähler, Refresh-Anzahl).
7. Auswertung: Speicherverlauf (kein stetiger Anstieg), CPU-Mittel/Spitzen, API-Aufrufe pro Stunde,
   Reconnect-Dauern, Anzahl „Ausgang unklar“, verlorene/doppelte Requests (Soll: 0).
