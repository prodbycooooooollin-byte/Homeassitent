# CITADEL – Deadlock Settings & Performance

Windows-Desktop-App (Tauri 2 + React + TypeScript + Rust) mit zentralem Recherche-Backend (Node 22 + SQLite).
Ziel: Deadlock-Configs verstehen, schnell und sicher ändern, vergleichen, anwenden, wiederherstellen – und
nachvollziehen, ob sich das Spiel dadurch verbessert.

> Community-Werkzeug, nicht mit Valve verbunden. Alle Spiel-Einstellungen sind im Katalog als **„noch ungeprüft“**
> markiert, bis sie in einem konkreten Build verifiziert wurden (siehe [docs/VERIFY.md](docs/VERIFY.md)).

| Bereich | Stand |
|---|---|
| Config Studio (einfach + Experte, Vorschau, Backup, Anwenden, Rücklesen, Wiederherstellen, Konflikte) | umgesetzt |
| Recherche-Backend (Scheduler, Queue, Adapter, Provenienz, Abgleich, API v1) | umgesetzt |
| Performance Advisor (Hardware, Ziele, Regeln, Windows/Treiber) | umgesetzt |
| Crosshair Studio (34 eigene Presets, Editor, Vorschau, Codes, Anwenden) | umgesetzt |
| Spieler (belegte Werte, Vergleich, selektive Übernahme, Folgen, Feed) | umgesetzt |
| Benchmarks (PresentMon-Aufnahme / CSV-Import, Statistik, Vergleich) | umgesetzt, PresentMon-Aufruf ungetestet |
| Browser-Version (Import/Export, Crosshairs, Spieler, manuelle Hardware) | gleiche UI, `npm run build` |

Was tatsächlich geprüft wurde und was offen ist: **[docs/STATUS.md](docs/STATUS.md)**.

## Schnellstart

Voraussetzungen: Node 22+, Rust (stable), unter Windows WebView2 (in Windows 10/11 enthalten) und die
[Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/).

```bash
cd citadel
npm install

# Recherche-Backend lokal (API + Worker in einem Prozess, SQLite unter server/data/)
cp .env.example .env            # Werte eintragen; ohne Schlüssel laufen die schlüsselfreien Quellen
set -a; . ./.env; set +a         # (PowerShell: Get-Content .env | ... oder Variablen manuell setzen)
npm run server:all

# Desktop-App im Entwicklungsmodus
npm run tauri dev

# Browser-Version (gleiche Oberfläche, Import/Export)
npm run dev                      # http://localhost:5173
```

Windows-Installer bauen: `npm run tauri build` → `src-tauri/target/release/bundle/{nsis,msi}/`.
Der GitHub-Workflow `release-citadel.yml` baut beides auf `windows-latest` (unsigniert – SmartScreen kann warnen).

## Prüfen

```bash
npm run typecheck                           # TypeScript (UI, Core, Server)
npm test                                    # Core + End-to-End-Datenprozess (lokaler Fixture-Server)
cd crates/citadel-native && cargo test      # Dateioperationen, Backups, Journal, Steam, Hardware-Parser
cd src-tauri && cargo test                  # IPC-Schnittstelle mit den Payloads der Oberfläche
npm run build && npm run screenshots        # Browser-Durchlauf aller Seiten (Playwright), Screenshots in docs/screenshots
```

## Architektur

```
citadel/
  src/core/            gemeinsame, plattformunabhängige Logik (auch vom Backend genutzt)
    kv.ts, cfg.ts        verlustfreie Parser (KeyValues für video.txt/gameinfo.gi, Konsolen-cfg)
    catalog.ts           versionierter Einstellungskatalog mit Belegen, Status, Anwendbarkeit
    config.ts            Entwurf ↔ Formular, semantischer Diff, ChangeSet, Import, Erklärung
    profiles.ts          Profile, Mixer mit Konflikten, portabler Export
    crosshair.ts         Crosshair-Modell, 34 Presets, CITADEL-Codes, SVG-Renderer
    benchmark.ts         Frametime-CSV, Statistik, Vergleich
    recommendations.ts   deterministische Regeln, Treiber-/Engpass-Hinweise
    patch.ts, sensitivity.ts, models.ts, diff.ts, text.ts
  src/platform/        Desktop (Tauri-Commands) vs. Browser (Import/Export, localStorage)
  src/ui/              React-Oberfläche (Übersicht, Config Studio, Optimieren, Crosshairs, Spieler, Benchmarks, Profile & Backups)
  crates/citadel-native/  Rust ohne Tauri: Pfadschutz, Steam-Erkennung, Lesen/Schreiben mit Backup+Journal, Hardware, Ablage
  src-tauri/           dünne Tauri-Shell, eng begrenzte Commands, Capabilities
  server/              Recherche-Backend: db, net/fetcher (SSRF-Schutz), jobs (Scheduler/Queue),
                       adapters/*, extract/{rules,ai}, pipeline/{validate,reconcile,store}, api
  test/                Node-Tests + Fixtures
  docs/                STATUS, SOURCES, SETTINGS, BENCHMARK, VERIFY, Screenshots
```

Zentrale Designentscheidungen:

- **Ein Entwurf pro Datei.** Formular und Texteditor arbeiten auf demselben Entwurfstext. Formularänderungen sind
  Span-Ersetzungen im Originaltext – Kommentare, unbekannte Schlüssel, Reihenfolge, Zeilenenden, BOM bleiben erhalten.
- **Schreiben nur über den Anwenden-Ablauf** (Rust): Konfliktprüfung per SHA-256 → Backup → Journal → temporäre Datei +
  Ersetzen → Rücklesen → bei Teilfehlern Rücksetzen aus dem Backup. Während Deadlock läuft, wird nicht geschrieben.
- **Gerätewerte** (`Version`, `VendorID`, `DeviceID`, Auflösung, Monitor, Bildwiederholrate) werden nie aus fremden
  Configs übernommen. `gameinfo.gi` wird nie als Ganzes übernommen; ungeprüfte ConVars bleiben Entwurf.
- **Recherche zentral**, Clients lesen die API v1. Schlüssel für Suche/AI liegen nur auf dem Server.
  Jeder Feldwert trägt Provenienz (URL, Beleg, Quelltyp, Abruf-/Veröffentlichungsdatum, Extraktorversion, Validierung).

## Betrieb des Recherche-Backends

- `npm run server` (nur API), `npm run worker` (nur Hintergrundjobs), `npm run server:all` (beides).
- `npx tsx server/main.ts run-once <quelle>` führt eine Quelle sofort aus und gibt die Abdeckung aus.
- Docker: `docker build -f server/Dockerfile -t citadel-research .` und `docker run -p 8787:8787 -v citadel-data:/data --env-file .env citadel-research`.
- Quellen: `server/sources.json`. Anbieter, Bedingungen, Limits und Kosten: [docs/SOURCES.md](docs/SOURCES.md).
- Betreiber-Ausnahmen: `GET /v1/admin/exceptions` (Bearer `CITADEL_ADMIN_TOKEN`) – ungeklärte Kandidaten, Konflikte,
  abgelehnte Werte, fehlgeschlagene Jobs, AI-Kosten der letzten 14 Tage. Reguläre Importe brauchen keine Freigabe.

Öffentliche Endpunkte: `/v1/status`, `/v1/players`, `/v1/players/{id}`, `/v1/changes?since=&players=`,
`/v1/config-artifacts`, `/v1/config-artifacts/{id}/raw`, `/v1/sources`.

Die Desktop-App nutzt standardmäßig `http://127.0.0.1:8787` (Build-Variable `VITE_CITADEL_API`, in der App unter
Einstellungen änderbar). Ohne erreichbaren Dienst zeigt sie den zuletzt geladenen Stand mit Datum.
