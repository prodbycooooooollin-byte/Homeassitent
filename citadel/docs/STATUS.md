# Stand, Prüfbericht und offene Punkte

Stand: 30.09.2026.

## 1. Bestandsaufnahme der Zielumgebung und der Dateiformate

**Entwicklungsumgebung:** Linux-Container ohne Windows, ohne Deadlock-Installation. Ausgehendes Netz eingeschränkt:
npm, crates.io, GitHub per `git clone` und Websuche erreichbar; **nicht** erreichbar waren api.deadlock-api.com,
liquipedia.net, raw.githubusercontent.com und die GitHub-REST-API. Konsequenz: Adapter wurden gegen Nachbildungen der
echten Antwortformate getestet, nicht live.

**Verifizierte Dateiformate (aus echten Dateien bzw. Quellcode):**

| Datei | Befund | Beleg |
|---|---|---|
| `game/citadel/cfg/video.txt` | Valve-KeyValues, Kopf `"video.cfg" { … }`, `"Version" "20"`, `"VendorID"`, `"DeviceID"`, danach `"setting.<name>" "<wert>"`. Booleans teils `0/1`, teils `true/false`; Floats mit 6 Nachkommastellen. | Bild einer vom Spiel geschriebenen Datei im OptiLock-Repo (Commit vom 29.09.2026) |
| `game/citadel/gameinfo.gi` | KeyValues ohne Anführungszeichen-Pflicht, Kommentare `//`, Block `GameInfo › ConVars` mit ConVar-Zuweisungen, `FileSystem › SearchPaths`. Community-Presets ersetzen die Datei komplett und fügen `citadel/addons` hinzu (Mod-Abhängigkeit). | OptiLock `gameinfo.gi` ver. 4.6 |
| `game/citadel/cfg/autoexec.cfg` | Konsolen-cfg; laut veraltetem Community-Repo im cfg-Ordner. **Ob Deadlock sie im aktuellen Build automatisch ausführt, ist ungeprüft.** | Skip-eo (als veraltet markiert) |
| ConVars | Namen, Standardwerte und Flags (u. a. alle `citadel_crosshair_*`, `sensitivity` 1.25, `zoom_sensitivity_ratio` 1, `m_yaw` 0.022, `citadel_camera_hero_fov` 90) | OptiLock `cvarlist.md` |
| Steam | `steamapps/libraryfolders.vdf`, `appmanifest_1422450.acf` (`installdir`, `buildid`, `LastUpdated`) | Steam-Standardformat; Parser getestet mit nachgebildeten Dateien |

**Technische Unsicherheiten (bewusst offen gehalten):**

- Zuordnung der internen Regler (`cpu_level`, `gpu_level`, `gpu_mem_level`, `mem_level`, `r_citadel_upscaling`,
  `r_citadel_antialiasing`) zu Menüpunkten und Werten. → im Katalog „noch ungeprüft“, Empfehlungen nennen das.
- Speicherort der Menü-Tastenbelegung und der vom Spiel selbst gespeicherten ConVars (Flag `a`/`per_user`) – nicht
  geprüft, wird nicht verändert.
- cm/360: Formel nicht verifiziert → wird nicht berechnet, nur eDPI.
- FOV-Achse/-Bezug von `citadel_camera_hero_fov` und die Wirkung von `r_aspectratio` → nur Entwurf.
- `steam.inf`-Schlüssel (PatchVersion/ClientVersion) sind eine Annahme; fehlen sie, bleibt der Wert leer.

## 2. Tatsächlich durchgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` (UI, Core, Server) | fehlerfrei |
| `npm test` – 30 Node-Tests (Core 22, Recherche-Pipeline 8) | alle bestanden |
| `cargo test` in `crates/citadel-native` – 16 Tests | alle bestanden (Linux) |
| `cargo check --target x86_64-pc-windows-gnu` für `citadel-native` (Registry, CIM, EnumDisplaySettings) | kompiliert |
| `cargo test` in `src-tauri` – IPC-Test über Tauris Mock-Runtime mit der echten Capability-Konfiguration und exakt den JSON-Payloads der Oberfläche | bestanden |
| `cargo build` der Tauri-App (Linux, WebKitGTK) | erfolgreich; Windows-Build der Tauri-Shell nur per CI (Ressourcen-Compiler fehlte lokal) |
| `vite build` + Browser-Durchlauf aller Seiten mit Playwright (`npm run screenshots`) | ohne Browserfehler; Screenshots in `docs/screenshots/` |

Durch Tests abgedeckte Abnahmekriterien:

- Nicht bearbeitete Inhalte bleiben byte-identisch; Speichern + erneutes Einlesen konsistent; BOM, CRLF, Float-Format erhalten.
- Fremde Gerätewerte (`VendorID`, `DeviceID`, Auflösung …) gelangen nicht in die lokale `video.txt`; auch im Expertenmodus blockiert.
- Crosshair-Import verändert nur `citadel_crosshair_*`; `sv_cheats`, `exec`, `alias` werden nie übernommen.
- Ungültige Werte werden abgelehnt; externe Dateiänderung → Konflikt ohne Schreiben; Teilfehler bei mehreren Dateien →
  bereits geschriebene Dateien werden aus dem Backup zurückgesetzt; Journal-Wiederherstellung nach Absturz.
- Wiederherstellung sichert vorher den aktuellen Stand; eine alte `gameinfo.gi` wird nicht über einen neuen Build kopiert.
- Benchmark-Kennzahlen aus CSV mit dokumentierter 1%-Low-Definition; „uneindeutig“ bei überlappenden Messbereichen.
- Recherche: realer Datenpfad Entdeckung → Zuordnung (Steam-ID verbindet Rangliste und Liquipedia) → Extraktion →
  Validierung → Veröffentlichung → API mit Quelle und Datum; geänderte Quelle erzeugt Änderungsereignis (alt/neu);
  unveränderte Wiederholung erzeugt keine Duplikate; gleichnamige Spieler bleiben getrennt; fremdes Spiel wird ignoriert;
  alter Drittartikel überschreibt nicht (Konflikt); nur Namensgleichheit → ungeklärter Kandidat; verschwundene Quelle →
  Ereignis; HTTP 500 → Backoff; fehlender Suchschlüssel → Quelle „inaktiv“, „Suche aktiv“ erscheint nicht.
- AI: absichtlich fehlende Sensitivität bleibt unbekannt – erfundene bzw. nicht wörtlich belegte Werte werden verworfen;
  Budget und Inhalts-Cache greifen (Test mit simuliertem Modell-Client; kein echter API-Aufruf).
- Eine zusammengesetzte Config heißt nie „Original“; portable Exporte enthalten keine Geräte-/Spieler-IDs.
- Kein Quellen-Update verändert die lokale Config: Übernahmen gehen immer in den Entwurf und über „Änderungen prüfen“.

## 3. Nicht durchgeführt / offen

- **Kein Test unter Windows mit echtem Deadlock** (Erkennung, Schreiben, Übernahme durch das Spiel, Hardware-Erkennung,
  Display-Modi, PresentMon-Aufruf, Tastatur/Skalierung in WebView2). Checkliste: [VERIFY.md](VERIFY.md).
- **Kein Live-Abruf** von deadlock-api.com, Liquipedia, GitHub-API, Brave, YouTube und der Claude API aus dieser Umgebung.
  Daher liefert das Repository **keine** vorab befüllte Spielerdatenbank; der Dienst baut sie beim ersten Lauf selbst auf.
  Die Screenshots zeigen einen fiktiven Testspieler aus dem Fixture-Server („AuroraX“, als TESTFIXTURE gekennzeichnet)
  und eine synthetische Beispiel-CSV – keine echten Spieler- oder Messdaten.
- Katalog: keine Einstellung „bestätigt“ (braucht Prüfung im Spiel, siehe VERIFY.md).
- Nicht umgesetzt: Bild-Extraktion (Screenshots), optionale KI-Erklärtexte in der App, Ergänzung fehlender Grafikwerte
  eines Spielerprofils aus dem Hardware Advisor, öffentliche Web-Veröffentlichung der Browser-Version, Code-Signierung,
  Auto-Update der Desktop-App, Postgres-Betrieb (SQLite reicht für den Start).
- Crosshair-Renderer ist eine Annäherung (nicht mit dem Spiel abgeglichen); heldenspezifische Reticles werden nicht simuliert.
