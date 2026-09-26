# LIKED

**Aus wessen Likes stammt dieser Clip?** Ein Multiplayer-Partyspiel für Windows (3–8 Spieler, jeder am eigenen PC).
Jede Person verbindet ihren TikTok-Account, LIKED importiert gelikte Videos, mischt die Clips aller Spieler,
und alle raten gleichzeitig, aus wessen Like-Liste der Clip stammt.

> **Stand des TikTok-Imports:** Der automatische Like-Import ist über die offizielle TikTok Data Portability API
> implementiert, aber **noch nicht mit einem echten Konto getestet**. Dafür fehlt eine von TikTok freigegebene
> App. Ohne diese Freigabe sind nur deutlich gekennzeichnete **Demo-Partien** möglich.
> Einzelheiten stehen in [docs/INTEGRATION_REPORT.md](docs/INTEGRATION_REPORT.md), offene Punkte in
> [docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md).

## Für Spieler: installieren und spielen

1. **Installieren:** `LIKED-Setup-<version>.exe` aus den GitHub-Releases (`liked-v…`) starten. Der Installer
   legt einen Startmenüeintrag und eine Desktopverknüpfung an. Deinstallieren geht über „Apps & Features“.
   Der Installer ist nicht signiert, daher kann SmartScreen warnen: „Weitere Informationen → Trotzdem ausführen“.
2. **Profil:** Beim ersten Start die kurze Einführung ansehen (oder überspringen). Danach Anzeigename und Avatar
   wählen. Ein Konto oder Passwort ist nicht nötig.
3. **TikTok verbinden:** *Einstellungen → TikTok → „TikTok verbinden“.* Die Anmeldung öffnet sich im Browser direkt
   bei TikTok. Danach auf **„Likes synchronisieren“** klicken. TikTok stellt die Daten asynchron bereit (Minuten bis
   Tage). LIKED zeigt den Status an und fragt ihn beim nächsten Start erneut ab.
4. **Raum erstellen:** *Raum erstellen → „Mit TikTok-Likes“* (oder zum Ausprobieren „Demo-Partie“). Den Raumcode
   bzw. Beitrittslink an Freunde schicken.
5. **Beitreten:** *Raum beitreten* → sechsstelligen Code eingeben (ein eingefügter Link wird erkannt).
6. **Lobby:** „Ton & Video testen“ → „Ich bin bereit“. Der Host wählt Clips pro Person (5/8/10) und die Antwortzeit
   (15/20/30 s) und startet, sobald mindestens drei Spieler bereit sind.
7. **Spielen:** Clip ansehen, auf die Karte der Person klicken, die ihn gelikt hat (oder Taste 1–9). Pro Runde zählt
   genau ein Tipp. Wer selbst die Quelle ist, schaut in dieser Runde zu.

Die App verbindet sich automatisch mit dem zentralen LIKED-Server (`https://liked-partyspiel-server.onrender.com`, eingerichtet über `render.yaml`). Es muss nichts eingetragen werden.

## Für Entwickler

```bash
cd liked
npm install                 # Node ≥ 22
npm run typecheck
npm test                    # 65 Tests: Spiellogik, Connectoren, Multiplayer-Server, Auth-Dienst
npm run dev:server          # Spielserver auf :8787
npm run dev:desktop         # Desktop-App bauen und in Electron starten
(cd apps/desktop && npx vite)    # Browser-Vorschau auf :5173 (nur Demo-Daten)
npm run dist:win            # Windows-Installer (auf Windows oder in CI)
```

Projektstruktur:

```
packages/protocol           validierte Nachrichtenschemata (zod), Sichten, Konstanten, Video-ID-Normalisierung
packages/game-core          Punkte, Streaks, Zeitgruppen, Blockplanung, Clip-Auswahl, Rollback, Zustandsmaschine
packages/tiktok-connectors  Data-Portability-Client, Streaming-Archivparser, lokaler Index, Demo-Adapter
apps/server                 Socket.IO-Spielserver + getrennter TikTok-Auth-Dienst, Healthcheck, Dockerfile
apps/desktop                Electron-Hauptprozess, Preload, React-Oberfläche, Sounds, Player, Updater
deploy/                     docker-compose + Caddy (HTTPS/WSS)
docs/                       Architektur, Server, Integrationsbericht, Testbericht, Release, Lizenzen, offene Punkte
```

Weitere Dokumente:
[Architektur & Sicherheit](docs/ARCHITECTURE.md) · [Server-Anleitung](docs/SERVER.md) ·
[Integrationsbericht TikTok](docs/INTEGRATION_REPORT.md) · [Testbericht](docs/TEST_REPORT.md) ·
[Build & Release](docs/RELEASE.md) · [Assets & Lizenzen](docs/ASSETS_LICENSES.md) · [Offene Voraussetzungen](docs/OPEN_ITEMS.md)

Der Arbeitsname „LIKED“ ist austauschbar. Vor einer Veröffentlichung Marken- und Namensverfügbarkeit prüfen.
