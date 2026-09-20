# 3. Bauen

## 3.0 Ohne lokale Toolchain: Artefakt aus GitHub Actions

Der Workflow `.github/workflows/keydock-windows.yml` baut bei jedem Push auf
`windows-latest` mit Visual Studio 2022 und legt das Ergebnis als Artefakt
`KeyDock-Windows-x64` ab. Für die reine Benutzung ist das der einfachste Weg —
siehe README, Abschnitt „Fertigen Build herunterladen".

Der Workflow baut zusätzlich unter Linux die Engine und lässt `ctest` laufen,
damit die Testergebnisse im PR belegt sind und nicht nur lokal existieren.

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

## 3.4 Das Prüfwerkzeug `keydock-analyze`

Wird von beiden Builds oben mitgebaut (`KEYDOCK_BUILD_CLI`, standardmäßig an):

```
build/cli/keydock-analyze            (Linux/macOS)
build\cli\Release\keydock-analyze.exe  (Windows)
```

Es nutzt **exakt dieselbe Engine** wie das Plugin und liest WAV-Dateien
(PCM 8/16/24/32 Bit und Float 32/64 Bit, mono oder mehrkanalig, beliebige
Samplerate). Damit lässt sich die Analysequalität prüfen, bevor überhaupt ein
VST3 gebaut ist. Siehe `docs/05-tests.md`, Abschnitt 5.2.

## 3.5 Installation

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

## 3.6 Bekannte Build-Hinweise

- **Erster Build dauert lange**, weil JUCE geklont und übersetzt wird.
- Der Overlay-Build erzeugt bewusst eine **GUI-Anwendung ohne Konsolenfenster**
  (`WIN32`-Target, `wWinMain`).
- Die Engine übersetzt mit `/W4` bzw. `-Wall -Wextra` warnungsfrei.
