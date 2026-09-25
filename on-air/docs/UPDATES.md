# Installer, Releases und automatische Updates

Kurz: **Jeder Push auf den Hauptzweig oder den Entwicklungszweig (Änderungen unter `on-air/`)
erzeugt automatisch eine neue Version.** Installierte Apps finden sie, laden sie im Hintergrund,
prüfen sie und installieren sie in einem ruhigen Moment. Es ist **keine Einrichtung nötig**.

## Installieren

Aus dem neuesten Release `ON AIR 0.2.x` die Datei **`ON-AIR-Setup_<version>.exe`** herunterladen
und starten. Das ist der immersive Installer:

- eigene Oberfläche im ON-AIR-Design (rahmenloses Fenster, animierter Fortschritt, „Studio-Lampe“,
  die beim Abschluss angeht);
- Optionen: Desktop-Verknüpfung, danach starten;
- erkennt eine vorhandene Installation und bietet „Jetzt aktualisieren“ bzw. „Reparieren“ an;
- weist darauf hin, wenn ON AIR gerade läuft (wird für die Installation kurz beendet);
- keine Administratorrechte (Installation im Benutzerkonto).

Technisch installiert er das eingebettete NSIS-Paket still (`/S`). Deinstallation, Startmenü,
Registrierung und Updates sind dadurch identisch mit dem klassischen Installer. Fehlt WebView2
(nur sehr alte Windows-Versionen), öffnet sich direkt der klassische Installer, der WebView2 selbst
nachlädt. Bei Problemen gibt es im Installer „Klassischen Installer öffnen“. Der klassische
Installer (auch das kurze Fortschrittsfenster bei Updates) trägt gebrandete Bilder
(`src-tauri/installer-assets/`).

Windows SmartScreen kann warnen, weil die Dateien nicht code-signiert sind
(*Weitere Informationen → Trotzdem ausführen*). Code-Signing erfordert ein kostenpflichtiges
Zertifikat und ist unabhängig vom Update-Mechanismus.

**Einmalig:** Versionen, die vor dieser Update-Funktion installiert wurden (ältere Test-Artefakte),
können sich nicht selbst ersetzen. Einmal `ON-AIR-Setup_<version>.exe` ausführen – Einstellungen,
Warteschlange und Anmeldungen bleiben erhalten. Danach geht alles automatisch.

## Wie Releases entstehen

Workflow [`.github/workflows/on-air-release.yml`](../../.github/workflows/on-air-release.yml):

1. Auslöser: Push auf `claude/home-assistant-dashboard-59c5bs` oder `claude/clever-gates-l5gp7q`
   mit Änderungen unter `on-air/` (oder ein Tag `on-air-vX.Y.Z`, oder manuell).
2. Version: `<major>.<minor>` aus `tauri.conf.json` + Laufnummer, z. B. `0.2.14`
   (`scripts/ci-version.mjs`). Tag-Builds behalten die Tag-Version.
3. Tests (TypeScript, Rust-Kern), dann Build der App (NSIS + MSI) und des immersiven Installers
   (mit eingebettetem NSIS-Paket).
4. `latest.json` mit URL, **SHA-256** und Größe je Paket (`scripts/make-latest-json.mjs`).
5. Release `on-air-v<version>` als Entwurf → Vollständigkeit prüfen → veröffentlichen → öffentliche
   Erreichbarkeit prüfen.
6. Update-Kanal: `latest.json` in das Release **`on-air-stable`** – nur wenn die Version neuer ist
   als die dort stehende (sich überholende Läufe stellen nie zurück).

Der Kanal ist ein eigenes Release, weil das Repository auch Releases anderer Projekte enthält
(`/releases/latest` zeigte sonst auf diese).

## Wie die App Updates prüft

| Modus | Wann | Prüfung |
|---|---|---|
| **Prüfsumme** (Standard) | kein eigener Schlüssel hinterlegt | HTTPS von den GitHub-Releases dieses Repositorys; Paket-URL muss unter demselben Release-Pfad liegen wie das Manifest; Größe und **SHA-256** müssen stimmen; nur echt neuere Versionen; Windows-Programmkopf |
| **Signatur** (optional) | Secret `TAURI_SIGNING_PRIVATE_KEY` + Variable `ONAIR_UPDATER_PUBKEY` hinterlegt | zusätzlich minisign-Signatur mit Versionsbindung (offizieller Tauri-Updater) |
| aus | Entwicklungsbuilds (`tauri dev`) | – |

**Ehrliche Einordnung des Standardmodus:** Er schützt vor manipulierten Downloads unterwegs
(HTTPS), vor fremden Download-Adressen und vor beschädigten Paketen. Er schützt **nicht** davor,
dass jemand mit Schreibrechten am Repository eine eigene Version veröffentlicht – das kann bei
einem im CI hinterlegten Schlüssel allerdings ebenfalls, wer Workflows ändern darf.
Wer die zusätzliche Signaturprüfung möchte: `node scripts/setup-updater.mjs` (legt Schlüssel und
Secrets an). Ab dem nächsten Release sind neue Versionen signiert; Apps, die mit Schlüssel gebaut
wurden, verlangen dann Signaturen.

## Automatisches Installieren

*Einstellungen → Updates → „Updates automatisch installieren“* (Standard: an).

1. **Prüfen:** 20 s nach dem Start, danach alle 4 Stunden; nach Fehlern erneut nach 30 min.
2. **Laden:** sofort im Hintergrund, mit Prüfung (s. o.) vor der Freigabe.
3. **Installieren – nur in einem sicheren Moment** (`update_state::decide_auto_install`, unit-getestet):
   - nie, solange du laut Twitch live bist, eine Streamplanung läuft oder eine Übergabe an Spotify
     läuft bzw. ungeklärt ist;
   - in den ersten 5 Minuten nach dem App-Start sofort;
   - später erst, wenn die Musik mindestens 10 Minuten pausiert.
4. **Countdown:** 30 Sekunden Hinweis in Haupt- und Kompaktfenster mit **„Nicht jetzt“** (bis zum
   nächsten Start keine automatische Installation) und **„Jetzt installieren“**. Wird der Moment
   unsicher, bricht der Countdown ab.
5. **Installation:** Requests pausieren, Kanalpunkte-Belohnung pausieren, Datenbank sichern, dann
   das NSIS-Paket passiv (`/P /UPDATE /R`) – kleines Fortschrittsfenster, danach startet ON AIR neu.
6. Scheitert eine automatische Installation, wird sie in dieser Sitzung nicht wiederholt.

Ohne Automatik: nur Hintergrundprüfung (abschaltbar); Laden und Installieren per Klick. Vor einer
manuellen Installation zeigt ein Dialog den Live-Status, wartende Requests/Einlösungen und eine
laufende Streamplanung.

## Wiederherstellung

- **Update defekt:** älteres `ON-AIR-Setup_<version>.exe` aus einem früheren Release ausführen.
  Hat die neue Version das Datenbankschema erhöht, verweigert die ältere den Start mit dieser
  Datenbank (Schutz vor Datenverlust). Vor jeder Migration liegt eine Sicherung unter
  `backups/onair-v<alt>-<zeitstempel>.db` im Datenverzeichnis; sie kann bei beendeter App als
  `onair.db` zurückkopiert werden.
- **Kanal zurückstellen:** `latest.json` im Release `on-air-stable` durch die Datei aus dem
  gewünschten `on-air-v*`-Release ersetzen (Apps installieren nur *neuere* Versionen als ihre eigene).
- **Automatik stoppen:** in der App abschalten; für alle Nutzer den Workflow deaktivieren.

## Nicht geprüft

- Ein echter Durchlauf auf Windows (Installer-Oberfläche in WebView2, stilles NSIS, passives Update
  mit Neustart) – in der Entwicklungsumgebung gab es keinen Windows-Rechner. Der CI-Build unter
  Windows kompiliert und paketiert alles.
- Durchgeführt: echte App unter Linux mit lokalem Update-Server im Prüfsummen- und im
  Signaturmodus (Suche → Laden → Prüfung → Countdown → Installation bzw. sauberer Fehlerpfad);
  Installer-App unter Linux (Fenster, Oberfläche, Backend-Aufrufe, Schließen); alle
  Installer-Schritte im Browser.
