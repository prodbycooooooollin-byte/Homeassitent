# Lokale Prüfschritte unter Windows

Diese Schritte konnten in der Entwicklungsumgebung (Linux-Container ohne Deadlock, ohne Windows, mit eingeschränktem
Netzwerk) **nicht** ausgeführt werden. Sie sind die Abnahme für einen echten Windows-PC.

## 0. Vorbereitung

1. Deadlock über Steam installieren und einmal starten/beenden (damit `video.txt` vom Spiel geschrieben wird).
2. `citadel/` bauen (`npm install`, `npm run tauri build`) oder den Installer aus dem Workflow `release-citadel.yml` verwenden.
3. Optional Recherche-Dienst starten (`npm run server:all`, siehe README).

## 1. Installation, Einlesen, Bearbeiten, Anwenden, Wiederherstellen

- [ ] Übersicht zeigt die Installation mit Build-ID. Bei mehreren Bibliotheken/Installationen fragt die App nach.
- [ ] „Ordner wählen …“ akzeptiert `…\steamapps\common\Deadlock` und auch `…\game\citadel\cfg`.
- [ ] Config Studio → Anzeige/Grafik zeigt „Aktuell“-Werte identisch zu `game\citadel\cfg\video.txt`.
- [ ] Einen Wert ändern (z. B. FPS-Limit). Rechte Vorschau und Zähler aktualisieren sich; im Expertenmodus ist die Zeile geändert.
- [ ] „Änderungen prüfen“ zeigt nur diese Änderung, Diff enthält genau eine geänderte Zeile.
- [ ] Deadlock starten → „Änderungen anwenden“ schreibt **nicht** („Deadlock läuft – als Entwurf behalten“).
- [ ] Deadlock beenden → Anwenden. Toast „Gespeichert und zurückgelesen“. Datei per Editor prüfen: nur der Wert ist anders,
      CRLF/Tabs/Reihenfolge/übrige Einträge unverändert (z. B. mit `fc /b` gegen das Backup unter
      `%APPDATA%\app.citadel.deadlock-settings\backups\<id>\files\video.txt`).
- [ ] Datei extern ändern, dann in CITADEL erneut etwas anwenden → Konfliktmeldung; „Neu einlesen und zusammenführen“ überträgt die Formularänderung.
- [ ] Spiel starten, Einstellung im Spiel prüfen, beenden. App neu öffnen → Status „Spiel hat Werte beibehalten“ **oder**
      „Spiel hat Werte zurückgesetzt: …“. Ergebnis im Katalog notieren (→ Status „bestätigt“ mit Build-ID).
- [ ] „Spiel getestet – funktioniert“ → Profile & Backups → „Letzten funktionierenden Stand wiederherstellen“ zeigt Diff und stellt her;
      vorher wird der aktuelle Stand als eigenes Backup gesichert.

## 2. gameinfo.gi und Patch-Check

- [ ] Eine OptiLock-`gameinfo.gi` importieren (Config importieren & erklären): Mod-Hinweis (`citadel/addons`), FOV nur als Entwurf, nichts übernommen.
- [ ] Nach einem Spielupdate: Übersicht meldet Build-Wechsel; Wiederherstellung eines alten `gameinfo.gi`-Backups wird verweigert.

## 3. Crosshair

- [ ] Preset wählen → „Nur Crosshair lokal anwenden“ → Review zeigt nur `citadel_crosshair_*` in `autoexec.cfg`.
- [ ] Im Spiel prüfen, ob `autoexec.cfg` automatisch ausgeführt wird. Falls nicht: Konsolenbefehl kopieren und in der Konsole einfügen.
      Ergebnis dokumentieren (Katalogstatus der Crosshair-ConVars).
- [ ] Vorschau mit Spiel-Screenshot vergleichen; Abweichungen des Renderers (Abstand, Kontur, Punkt) notieren.

## 4. Hardware und Empfehlungen

- [ ] „Meinen PC analysieren“: CPU, GPU(s) mit VRAM aus der Registry, Treiber, RAM, Windows-Build, Monitore/Modi. Nicht verfügbare Werte heißen „Nicht ermittelbar“.
- [ ] Bei zwei GPUs erscheint die Auswahl; die Treiberseite verlinkt den passenden Hersteller.
- [ ] Windows-Einstellungsseiten öffnen sich (ms-settings:…).

## 5. Messung

- [ ] PresentMon-Konsolen-EXE wählen, Messung 30 s im Spiel. Bei Fehler (Rechte) erscheint die Ausgabe von PresentMon.
- [ ] Zwei Baseline- und zwei Variantenläufe → Vergleich zeigt Kennzahlen und „Kein klarer Vorteil“ bei kleinen Unterschieden.

## 6. Recherche (Server mit Internetzugang)

- [ ] `npx tsx server/main.ts run-once deadlock-api-leaderboard` → Spieler „Rangliste“ angelegt.
- [ ] `npx tsx server/main.ts run-once liquipedia` → Profis mit Team und Kanal-Links (Liquipedia-Bedingungen beachten: Kontakt im User-Agent).
- [ ] `npx tsx server/main.ts run-once github-configs` → OptiLock-Dateien als Community-Preset mit Lizenz GPL-3.0.
- [ ] Mit `BRAVE_SEARCH_API_KEY`: `run-once brave-search` und anschließend Worker laufen lassen → Seitenjobs, Kandidaten/Konflikte unter `/v1/admin/exceptions`.
- [ ] In der App (Spieler) erscheint ein realer, öffentlich belegter Wert mit Quelle und Datum.

## 7. Bedienung

- [ ] Alle Hauptabläufe per Tastatur (Tab/Shift+Tab, Enter/Leertaste, Esc schließt Dialoge).
- [ ] Windows-Anzeigeskalierung 125 %, 150 %, 200 %: Mindestfenstergröße 1080×680, keine abgeschnittenen Bedienelemente.
