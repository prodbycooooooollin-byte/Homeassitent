# Updates und Releases

ON AIR nutzt das offizielle [Tauri-Updater-Plugin](https://v2.tauri.app/plugin/updater/)
mit signierten Paketen aus **GitHub Releases** dieses Repositorys. Jedes Update wird vor der
Installation gegen einen öffentlichen Schlüssel geprüft, der beim Build in die App eingebaut
wird. Der private Schlüssel existiert nur auf deinem Rechner (Sicherung) und als
GitHub-Actions-Secret – nie im Repository, in der App, in Logs oder in Release-Dateien.

## Überblick

```
Tag on-air-vX.Y.Z ──► Workflow „ON AIR Release“ (windows-latest)
                        1. Version in allen Dateien = Tag?     (scripts/check-version.mjs)
                        2. cargo test + Typecheck
                        3. tauri build, signiert               (Secrets)
                        4. Assets umbenennen, latest.json      (scripts/make-latest-json.mjs)
                        5. Release-Entwurf → Assets prüfen → veröffentlichen
                        6. nur Stable: latest.json → Release „on-air-stable“
App ──► https://github.com/<repo>/releases/download/on-air-stable/latest.json
        └─► Signatur prüfen ─► herunterladen ─► auf Bestätigung installieren
```

Warum ein eigenes Kanal-Release `on-air-stable` statt `/releases/latest`? Das Repository
enthält auch Releases anderer Projekte (z. B. `clearspace-v…`). `latest` würde auf diese
zeigen. `on-air-stable` enthält ausschließlich `latest.json` und wird nur von
Stable-Releases (`on-air-vX.Y.Z` ohne Suffix) aktualisiert. Vorabversionen
(`on-air-vX.Y.Z-beta.N`) erscheinen als GitHub-Prerelease und werden **nicht** automatisch
angeboten.

## Einmalige Einrichtung

### 1. Schlüsselpaar erzeugen (lokal)

```bash
cd on-air
npx tauri signer generate -w ~/.tauri/onair.key
```

Das erzeugt `~/.tauri/onair.key` (privat, mit Passwort) und `~/.tauri/onair.key.pub` (öffentlich).

**Sichern:** Den privaten Schlüssel und das Passwort in einem Passwortmanager ablegen.
Geht der Schlüssel verloren, können bestehende Installationen **keine Updates mehr
annehmen** – sie müssen einmal manuell mit einem Installer neu installiert werden, der den
neuen öffentlichen Schlüssel enthält.

### 2. GitHub konfigurieren

Unter *Settings → Secrets and variables → Actions*:

| Art | Name | Inhalt |
|---|---|---|
| Secret | `TAURI_SIGNING_PRIVATE_KEY` | Inhalt von `~/.tauri/onair.key` |
| Secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Passwort des Schlüssels |
| Variable | `ONAIR_UPDATER_PUBKEY` | Inhalt von `~/.tauri/onair.key.pub` |

Der öffentliche Schlüssel ist bewusst eine *Variable* (kein Geheimnis). Fehlt eines davon,
bricht der Release-Workflow vor dem Build mit einer klaren Meldung ab.

Die App erhält öffentlichen Schlüssel und Kanal-URL beim Build über die Umgebungsvariablen
`ONAIR_UPDATER_PUBKEY` und optional `ONAIR_UPDATER_ENDPOINT`. Lokale Builds ohne diese
Variablen zeigen „Updates nicht eingerichtet“ – sie suchen nie ungeprüft nach Updates.

### 3. Repository-Sichtbarkeit

Der Updater lädt ohne Anmeldung. Das funktioniert nur, wenn Release-Dateien öffentlich
abrufbar sind (öffentliches Repository). ON AIR bettet **kein GitHub-Token** ein. Soll der
Quellcode privat bleiben, braucht es einen separaten öffentlichen Release-Ort (eigenes
öffentliches Repository nur für Releases oder ein eigener Server) – dann
`ONAIR_UPDATER_ENDPOINT` im Workflow darauf setzen. Der Workflow prüft nach dem
Veröffentlichen, dass `latest.json` und der Installer ohne Anmeldung erreichbar sind.

### 4. Erste Version einmalig manuell installieren

Version 0.1.0 enthält noch keinen Updater. Deshalb:

1. Release `on-air-v0.2.0` erzeugen (siehe unten).
2. `ON-AIR_0.2.0_x64-setup.exe` aus dem Release herunterladen und installieren
   (SmartScreen: *Weitere Informationen → Trotzdem ausführen*, da der Installer nicht
   code-signiert ist). Einstellungen, Queue und Anmeldungen bleiben erhalten.
3. Ab jetzt kommen Updates über *Einstellungen → Updates*.

## Release erstellen

```bash
cd on-air
node scripts/set-version.mjs 0.2.1     # package.json, package-lock.json, tauri.conf.json, Cargo.toml
# CHANGELOG.md ergänzen – der Abschnitt „## 0.2.1“ wird als Release-Text übernommen
git commit -am "ON AIR 0.2.1"
git tag on-air-v0.2.1
git push origin HEAD on-air-v0.2.1
```

Der Workflow bricht ab, wenn Tag und Dateiversionen nicht übereinstimmen, ein Test fehlschlägt,
die Signatur fehlt oder ein Asset nach dem Upload nicht abrufbar ist. Ein fehlgeschlagener Lauf
hinterlässt höchstens einen **Entwurf** – Nutzer sehen nichts davon.

`latest.json` enthält die Plattformschlüssel `windows-x86_64-nsis`, `windows-x86_64-msi` und
`windows-x86_64`. So aktualisiert eine per `.exe` installierte App mit dem `.exe`-Paket und
eine per `.msi` installierte mit dem `.msi`-Paket – der Installationsbereich wechselt nicht.

## Verhalten in der App

| Zustand | Bedeutung |
|---|---|
| Nicht eingerichtet | Build ohne öffentlichen Schlüssel – keine Suche. |
| Nicht geprüft / Suche läuft | – |
| Aktuell | Nur nach **erfolgreicher** Prüfung. Ein Fehler wird nie als „aktuell“ angezeigt. |
| Verfügbar | Version und Änderungen werden gezeigt; Download nur auf Klick. |
| Lädt | Fortschritt; es läuft höchstens ein Download. |
| Bereit | Signatur geprüft; Installation nur auf Bestätigung. |
| Installiert | Requests werden pausiert, Belohnung auf Twitch pausiert, Datenbank gesichert, dann Installer (passiv) und Neustart. |
| Fehlgeschlagen | Mit Grund: offline, Signatur ungültig, Datei fehlt, Manifest ungültig … |

- Automatische Suche 20 s nach dem Start (abschaltbar), **kein** automatischer Download.
- „Später“ blendet den Hinweis aus und startet **keinen** Timer.
- Vor der Installation zeigt ein Dialog, ob der Kanal gerade live ist (Twitch), wie viele
  Requests und offene Einlösungen warten und ob eine Streamplanung läuft. Ist der Kanal live,
  heißt die Schaltfläche „Trotzdem installieren“; ist der Live-Status unbekannt, wird das
  angezeigt. ON AIR installiert nie ungefragt.

## Wiederherstellung

- **Update defekt:** älteren Installer aus einem früheren `on-air-v*`-Release installieren.
  Achtung: Hat die neue Version das Datenbankschema erhöht, verweigert die ältere Version den
  Start mit dieser Datenbank (Schutz vor Datenverlust). Vor jeder Migration legt ON AIR eine
  Sicherung `backups/onair-v<alt>-<zeitstempel>.db` im Datenverzeichnis an; sie kann bei
  beendeter App als `onair.db` zurückkopiert werden.
- **Kanal zeigt falsche Version:** `latest.json` im Release `on-air-stable` durch die Datei
  aus dem gewünschten `on-air-v*`-Release ersetzen (oder den Workflow für dieses Tag per
  *Run workflow* erneut starten).
- **Privater Schlüssel kompromittiert:** neues Schlüsselpaar erzeugen, Secrets/Variable
  ersetzen, neue Version veröffentlichen. Bestehende Installationen müssen diese Version
  einmal manuell installieren.

## Nicht geprüft

- Ein echter Update-Durchlauf auf Windows (0.2.0 → 0.2.1) wurde **nicht** durchgeführt: In der
  Entwicklungsumgebung gab es keinen Windows-Rechner und keine hinterlegten Secrets.
  Getestet sind die Zustandslogik (Unit-Tests), die Signatur mit einem Wegwerf-Schlüssel und
  das Erzeugen von `latest.json`.
- Der Installer ist nicht code-signiert (SmartScreen-Warnung). Code-Signing ist von der
  Updater-Signatur unabhängig und erfordert ein kostenpflichtiges Zertifikat.
