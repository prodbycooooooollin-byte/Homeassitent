# 3. Bauen

## 3.1 Benötigte Werkzeuge

| Werkzeug | Version | Wofür |
|---|---|---|
| Visual Studio 2022 | mit „Desktopentwicklung mit C++" | Compiler für Plugin und Overlay |
| CMake | ≥ 3.22 | Buildsystem |
| Git | beliebig | JUCE wird per `FetchContent` geholt |

Externe Abhängigkeiten: **nur JUCE 8** (automatisch geladen, Tag in
`plugin/CMakeLists.txt` über `KEYDOCK_JUCE_TAG` fixiert). Das VST 3 SDK ist in
JUCE enthalten. Die Analyse-Engine und das Overlay haben **keine** externen
Abhängigkeiten.

## 3.2 Vollständiger Windows-Build

```powershell
git clone <dieses-repo>
cd keydock

cmake -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
```

Ergebnisse:

```
build\plugin\KeyDockPlugin_artefacts\Release\VST3\KeyDock.vst3
build\overlay\Release\KeyDockOverlay.exe
```

Unter Windows werden `KEYDOCK_BUILD_PLUGIN` und `KEYDOCK_BUILD_OVERLAY`
automatisch aktiviert.

## 3.3 Nur die Engine bauen und testen (jede Plattform)

Die Engine und die Controller-Tests hängen weder an JUCE noch an Windows:

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
ctest --test-dir build --output-on-failure
```

Das ist der Weg, auf dem die in `docs/05-tests.md` dokumentierten Ergebnisse
entstanden sind.

## 3.4 Installation

1. `KeyDock.vst3` **und** `KeyDockOverlay.exe` in **dasselbe** Verzeichnis
   kopieren, üblicherweise:

   ```
   C:\Program Files\Common Files\VST3\KeyDock.vst3
   C:\Program Files\Common Files\VST3\KeyDockOverlay.exe
   ```

   Die beiden müssen zusammenbleiben: der `OverlayLauncher` sucht die EXE
   relativ zum geladenen Plugin-Modul, nicht über PATH oder Registry.

2. In FL Studio: **Options → Manage plugins → Find more plugins**. Der Scan
   öffnet kein Overlay-Fenster (siehe `docs/02-architektur.md`, 2.10).

Einrichtung in FL Studio: `docs/04-einrichtung-fl-studio.md`.

## 3.5 Bekannte Build-Hinweise

- **Erster Build dauert lange**, weil JUCE geklont und übersetzt wird.
- Der Overlay-Build erzeugt bewusst eine **GUI-Anwendung ohne Konsolenfenster**
  (`WIN32`-Target, `wWinMain`).
- Die Engine übersetzt mit `/W4` bzw. `-Wall -Wextra` warnungsfrei.
