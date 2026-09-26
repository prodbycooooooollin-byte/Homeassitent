# Testbericht

Stand 26.09.2026. Legende: ✅ automatisiert getestet · 🟡 praktisch in der Build-Umgebung (Linux, Chromium/Electron,
lokales Netz) geprüft · 🔵 in CI auf Windows geprüft (siehe Workflow `release-liked.yml`) · ❌ **nicht getestet**.

`npm test` umfasst 65 Tests in 7 Dateien: Spiellogik, Protokoll, Connectoren, Multiplayer-Server mit echten
WebSocket-Clients und den Auth-Dienst gegen eine nachgebaute TikTok-API.

## Verbindliche Abnahmefälle

| # | Fall | Status | Nachweis |
|---|---|---|---|
| 1 | Vier Personen über ≥ 2 getrennte Internetanschlüsse | ❌ | Nur lokal: 4 echte Socket.IO-Clients über TCP (`multiplayer.test.ts`) und 4 Browser-Kontexte über die echte Oberfläche (Playwright, komplette 20-Runden-Demo-Partie ohne Konsolenfehler). Ein Test über getrennte Anschlüsse ist in dieser Umgebung nicht möglich. |
| 2 | Echte Like-Daten importiert, eigene Uploads nicht als Likes | ✅ Parser / ❌ echtes Konto | `connectors.test.ts`, `auth.test.ts`: nur „Like List“, keine Lesezeichen, Verläufe oder Uploads. Ein echtes Konto fehlt (keine TikTok-Freigabe). |
| 3 | Nur erfolgreicher Import → „bereit“ | ✅ | `auth.test.ts`: Login allein → `connected`; fehlender Scope → `unsupported`; Ablehnung → `error`; erst nach Download und Extraktion → `ready`. Ohne Server-Konfiguration → 503 `not_configured`; die Electron-App zeigt „Nicht unterstützt“ (🟡 per Playwright/Electron geprüft). |
| 4 | Block mit 4 Quellen: jeder rät 3×, setzt 1× aus | ✅ | `match.test.ts`, dazu der Server-Test über 20 Runden (15 Ratechancen je Spieler). |
| 5 | Schneller falscher Tipp beeinflusst Rang nicht | ✅ | `scoring.test.ts` |
| 6 | 1000/850/700, Zeitgruppen, Rundung, Streak-Deckel | ✅ | `scoring.test.ts` (inkl. 1100 und 893 aus der Spezifikation, m = 4/6/7, 80-ms-Grenzen) |
| 7 | Eigener Clip/annullierte Runde ohne Streak-Änderung; vollständiger Block-Rollback | ✅ | `match.test.ts`, Server-Test „Ausscheiden im zweiten Block“ |
| 8 | Lösung vor Auflösung nicht erkennbar | ✅ | Server-Test vergleicht in jeder Rundenversion die öffentlichen Teile aller 4 Sichten und prüft, dass es genau einen Besitzer gibt und kein Reveal vorliegt. |
| 9 | Doppelte/verspätete Stimmen | ✅ | `match.test.ts`, Server-Test (Doppelklick, anderes Ziel, Retry mit derselben ID, alte Round-ID, nach Rundenende) |
| 10 | Reconnect stellt Zustand und bestätigte Stimme wieder her | ✅ | Server-Test (Trennen nach Stimme → Resume → `you.vote.confirmed`); falscher Token wird abgelehnt |
| 11 | Defekter Clip fair ersetzt; Buffering ohne irreführende Wertung | ✅ Logik / ❌ echte Streams | Server-Test: Ladefehler → Retry → Ersatz vom selben Besitzer; Buffering → neutrale Annullierung ohne Reveal und ohne Statusänderung. Toleranzen (2,5 s Start, 3 s/5 s Buffering) sind **nicht** mit echten TikTok-Streams kalibriert. |
| 12 | Überlappende IDs ausgeschlossen, keine Wiederholung | ✅ | `selection.test.ts` (Pools und gesalzene Index-Hashes), `match.test.ts` (20 Runden ohne Wiederholung über 39 Seeds), Ressourcen-Test (Revanche ohne bereits gespielte Clips) |
| 13 | Tokens nicht in Payloads/Logs; Trennen wirkt | ✅ | `auth.test.ts` (Status-JSON, Logs, Datei auf der Platte, Widerruf, Löschung), Server-Log-Test (keine Clip-IDs, Namen, Tokens, Spieler-IDs) |
| 14 | Videoverkehr direkt TikTok ↔ Client | ✅ Architektur / ❌ Messung | Der Server kennt nur IDs; es gibt keinen Code-Pfad, der Medien lädt. Eine Netzwerkmessung mit echtem Embed fehlt. |
| 15 | Keine Ansammlung von Playern, Timern, Listenern | ✅ Server / 🟡 Client | Server: `timerCount` = 0 nach 3 Partien, Räume werden entfernt. Client: ein Player je Runde mit Cleanup; eine komplette UI-Partie lief ohne Fehler. Eine Langzeitmessung des Speichers fehlt. |
| 16 | Installer und App starten auf Windows ohne Entwicklungsumgebung | 🔵 (CI) | Der Windows-Job installiert still, prüft Startmenüeintrag, startet `LIKED.exe --smoke-test` (Oberfläche und IPC geladen) und deinstalliert. Der Runner hat zwar Node installiert, die App nutzt es aber nicht. Ein Test auf einem sauberen Privat-PC steht noch aus. |

## Weitere praktische Prüfungen in der Build-Umgebung (🟡)

- Echte Electron-App (unverpackt und als `electron-builder --linux dir` mit ASAR und Fuses): `--smoke-test` →
  `SMOKE_TEST_RESULT=ok`.
- Electron + Playwright: Renderer hat kein `require`/`process`, Origin ist `app://liked`, `openExternal` auf fremde
  Domains wird abgelehnt, ungültige IPC-Eingaben werden verworfen.
- Browser-Vorschau, 4 Spieler: Einführung, Menü, Demo-Raum, Beitritt per Code, Medientest, Ready, Start, Countdown,
  Runde, Besitzeransicht, Auflösung, Zwischenstand, Finale, jeweils bei 1440×900 und 1280×720 (Screenshots geprüft).
- Lastmessung: 50 Räume, 200 Spieler, 1 000 Runden (siehe SERVER.md).
- Docker-Build-Schritte simuliert (Server-Workspace ohne Desktop installieren, bündeln, starten).

## Nicht getestet (ehrlich)

- Echter TikTok-Login, Portability-Import, Stichprobenvergleich und Wiedergabe echter Clips in der App.
- Ob der TikTok Embed Player aus `app://liked` mit Sandbox-iframe abspielt (Autoplay mit Ton, Ereignisse).
- Internet-Multiplayer über getrennte Anschlüsse, echte Latenzen, Zeitgruppen-Fairness unter realem Ping.
- Hörtest der Sounds auf Windows-Hardware (Lautstärkeverhältnisse); Darstellung bei 1440p/4K und hoher DPI
  (nur über CSS-`clamp` vorbereitet).
- Update-Ablauf (latest.yml → Download → Installation beim Beenden). Voraussetzung sind ein erstes Release und ein
  öffentliches Repository oder Release-Hosting.
- Experimenteller Web-Adapter.
