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
| OBS-Dock: Schlüssel Pflicht, fremde Herkunft abgelehnt, Schlüssel nie in der Seite | `tests/overlay.rs` → `dock_requires_key_and_own_origin` | ✅ |
| `!playlist`: Name, privat, Name nicht abrufbar, Standard-Link; eigene Befehle mit Platzhaltern, Alias, Rolle | `playlist_command_shares_current_playlist` | ✅ |
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
| Chatantwort auf Kanalpunkte-Einlösung (einmal trotz Doppelzustellung; Ablehnung mit Erstattungshinweis) | `redemptions_are_deduplicated_and_settled` | ✅ |
| OBS-Dock-Zustand: Requests mit Aktionen, Pausegrund, keine Schlüssel | `dock_state_lists_requests_without_secrets` | ✅ |
| Fremde Kanalpunkte-Belohnung wird gemeldet (nicht still ignoriert), übernommen → Wünsche kommen an, kein falsches „erstattet“ | `foreign_reward_is_reported_and_can_be_used` | ✅ |
| Streamer löst selbst ein → Pro-Person-Limit greift nicht | `broadcaster_redemption_bypasses_user_limit` | ✅ |
| Sammel-Playlist: anlegen, jeder Song einmal, keine abgelehnten/App-Wünsche, gelöschte Playlist neu | `request_playlist_collects_each_song_once` | ✅ |
| Sammel-Playlist: alte Anmeldung ohne Rechte → Hinweis, Wunsch bleibt vorgemerkt | `request_playlist_requires_playlist_scope` | ✅ |
| Sammel-Playlist: volle Playlist → „Teil 2“ | `request_playlist_rolls_over_when_full` | ✅ |
| Übergebener, nie erkannter Song blockiert die Warteschlange nicht (Abgleich mit Spotify-Queue) | `unobserved_handoff_does_not_block_the_queue` (acceptance.rs) | ✅ |
| Song noch in Spotifys Queue → bleibt übergeben | `handoff_still_in_spotify_queue_is_kept` (acceptance.rs) | ✅ |
| Spotify-Relinking (andere ID, `linked_from`) wird als laufend erkannt | `relinked_track_is_recognized_as_playing` (acceptance.rs) | ✅ |
| Hängenden Eintrag von Hand als erledigt markieren | `handed_off_request_can_be_dismissed` (acceptance.rs) | ✅ |
| Abgleich offener Einlösungen scheitert dauerhaft → Belohnung wird trotzdem freigegeben | `reward_is_released_when_reconcile_keeps_failing` | ✅ |
| Kanalpunkte-Einrichtung hakt → eintreffende Einlösung wird trotzdem verarbeitet | `redemption_is_not_rejected_for_reward_sync_problems` | ✅ |
| Spotify abgemeldet → Chat-Wunsch gespeichert statt verworfen | `requests_are_kept_while_spotify_is_signed_out` | ✅ |
| Update nicht erfolgt → Update-Pause hebt sich selbst auf | `update_pause_expires_when_update_did_not_happen` | ✅ |
| Anmeldespeicher beim Start blockiert → Tokens werden nachgeladen | `tokens_are_reloaded_when_secret_store_was_unavailable` (acceptance.rs) | ✅ |
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

## Universal Request, Auswahl, Ersetzen, Verlauf – simuliert

`cargo test -p onair-core --test universal` (Fake-Spotify + Fake-YouTube/Apple/SoundCloud, keine echten Dienste):

| Abnahmefall | Test |
|---|---|
| Spotify-, YouTube-, Apple-, SoundCloud-Link und Kurzlink erzeugen genau einen Wunsch | `direct_and_external_links_create_exactly_one_request`, `apple_soundcloud_and_short_links` |
| Remix wird nicht mit Original verwechselt; Mehrdeutigkeit verlangt Auswahl | `remix_is_not_confused_and_ambiguity_needs_a_choice` |
| Fehlerzustände unterscheidbar (privat, nicht unterstützt, Einrichtung, Limit, kein Treffer) | `failure_states_are_distinct_and_understandable` |
| Auswahl nur durch denselben Zuschauer, neue ersetzt alte, `!abbrechen` | `selections_are_bound_to_the_viewer` |
| `!ersetzen` behält Platz, erzeugt keinen zweiten Wunsch | `replace_keeps_position_and_never_duplicates` |
| Ersetzen gleichzeitig mit Übergabe sendet nie zwei Songs / nie den falschen | `replace_racing_the_handoff_never_sends_two_songs` (schlug vor der Korrektur fehl) |
| Einlösung bleibt, Streamplan rechnet mit neuer Dauer | `replace_keeps_redemption_and_respects_budget` |
| `!letztersong` nur beobachtete Wiedergaben, ohne Doppelungen, nach Neustart | `last_played_lists_observed_plays_only` |
| Playlist nie komplett, nur explizit gewählter Titel | `playlist_needs_explicit_single_choice` |
| Vorabprüfung ohne Nebenwirkung, endgültige Prüfung verhindert Doppelannahme | `precheck_is_side_effect_free_and_final_check_prevents_races` |
| Wiederholung, Ablauf, Neustart erzeugen keine zusätzlichen Songs | `repeats_expiry_and_restart_create_no_extra_songs` |

Dazu Unit-Tests für Linkerkennung (Tracking-Parameter, regionale Pfade, `?i=`, Video+Liste, fremde
Hosts, Ports, Benutzerangaben), Titelbereinigung/Versionserkennung, Mehrwort-Aliasse und
Chatlängen sowie Playwright-Tests für den Dialog „Song hinzufügen“ (Versionen + Vorabprüfung,
Playlist mit Nachladen und Teilfilter, nicht unterstützter Dienst), „Song ändern“ und Musikquellen.

## Nicht durchgeführt

- Live-Test der Anbieter-Adapter mit echten YouTube-/Apple-/SoundCloud-Zugangsdaten und echten Links.
- Live-Smoke-Test mit echtem Spotify-Premium-Konto und Twitch-Kanal.
- Manueller Test der Windows-Build-Artefakte (Tray, Autostart, Credential Manager, echtes Standby).
- **Achtstündiger realer Dauertest** – noch nicht durchgeführt, keine Messwerte vorhanden.
- Echter Kanalpunkte-Durchlauf mit Affiliate-Konto.
- Echter Update-Durchlauf und immersiver Installer auf Windows (kein Windows-Rechner verfügbar).
  Durchgeführt wurde ein **lokaler End-to-End-Lauf unter Linux** mit der echten Desktop-App:
  Wegwerf-Schlüssel, lokaler Update-Server, signiertes Testpaket. Geprüft: automatische Suche
  → Download → Signaturprüfung (ohne Versionsbindung korrekt abgewiesen, mit Versionsbindung
  angenommen) → Countdown → „Nicht jetzt“ → nach Neustart automatische Installation mit
  Update-Vorbereitung (Requests pausiert, DB gesichert) → Paket installiert, App beendet sich
  zum Neustart. Dabei gefunden und behoben: Überlauf in der Live-Status-Zwischenspeicherung.
  Zusätzlich der **Prüfsummen-Modus ohne Schlüssel** (lokaler Server, SHA-256, Countdown,
  Installationsversuch mit sauberem Fehlerpfad unter Linux) und die **Installer-App** unter Linux.
  Unit-Tests `update_direct`: nur neuere Versionen, Herkunftsprüfung (fremde Hosts, andere Repos,
  Klartext, `..`), Pflicht von SHA-256/Größe, Manipulation erkannt.

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
