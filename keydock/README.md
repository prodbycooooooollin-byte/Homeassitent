# KeyDock

Key- und BPM-Analyse direkt oben rechts in FL Studio unter Windows 11 (64 Bit).

Abspielen, einmal klicken, Tonart und Tempo ablesen — ohne Export, ohne
Browserwechsel, ohne großes Pluginfenster.

```
┌──────────────────────────────────────────────────────────────┐
│ ▌ [Analysieren]  F# minor  11A   128.0 BPM   Ergebnis · 20 s ⌄⋮│
└──────────────────────────────────────────────────────────────┘
```

## Aufbau

| Teil | Was es ist |
|---|---|
| `engine/` | Analyse-Engine. Reines C++17, **keine Abhängigkeiten**, eigene FFT. Plattformunabhängig testbar. |
| `plugin/` | VST3-Analyse-Effekt (JUCE 8). Reicht Audio unverändert durch. |
| `overlay/` | Rahmenlose Win32-Begleitanwendung, die am FL-Hauptfenster hängt. |
| `shared/` | IPC-Protokoll, von beiden Seiten genutzt. |
| `docs/` | Machbarkeit, Architektur, Build, Einrichtung, Teststatus, Lizenzen. |

## Schnellstart

```powershell
cmake -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
```

Dann `KeyDock.vst3` und `KeyDockOverlay.exe` gemeinsam nach
`C:\Program Files\Common Files\VST3\` kopieren.

Nur Engine bauen und testen (jede Plattform):

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j
ctest --test-dir build --output-on-failure
```

## Dokumentation

1. [Machbarkeit und Architekturentscheidung](docs/01-machbarkeit.md) — warum
   Overlay statt Toolbar-Element, warum eigene Engine statt Essentia
2. [Architektur](docs/02-architektur.md) — Threads, Audio-Transparenz,
   Fensterverhalten
3. [Bauen](docs/03-build.md)
4. [Einrichtung in FL Studio](docs/04-einrichtung-fl-studio.md) — Slot-Wahl,
   Projektvorlage, Overlay positionieren
5. [Teststatus](docs/05-tests.md) — **getestet vs. ungeprüft, sauber getrennt**
6. [Lizenzlage](docs/06-lizenzen.md) — JUCE, VST 3 SDK, Essentia

## Was KeyDock ehrlich *nicht* kann

- **Es ist kein natives Toolbar-Element.** FL Studio bietet dafür keine
  offiziell unterstützte Schnittstelle. KeyDock ist ein optisch angeheftetes,
  rahmenloses Overlay — mit manuell wählbarem Floating-Modus für Toolbar-
  Presets ohne freien Platz. Details und Quellen:
  [docs/01-machbarkeit.md](docs/01-machbarkeit.md).
- **Es kennt keine Playlist-Spuren.** Über das Master-Signal sind weder Namen
  noch Solo-Zustände sichtbar. Analysiert wird ausschließlich, was am
  Plugin-Slot ankommt; was das ist, entscheidest du über Mute/Solo.
- **Es rät nicht.** Bei Stille, reinen Drums, einzelnen Tönen oder zu kurzem
  Material sagt KeyDock das, statt eine Tonart zu erfinden.
- **Die Sicherheitsangabe ist keine Prozentzahl.** Sie ist eine ordinale Stufe
  aus dem Score-Abstand, weil algorithmische Scores ohne Kalibrierung keine
  Trefferwahrscheinlichkeit sind.
- **Host-Tempo ist niemals das Ergebnis.** Das Projekt-Tempo wird nur separat
  als Anzeigewert geführt und erreicht die Engine nicht.
- **Der Status ist ungleich verteilt.** Engine und Aufnahme-Zustandsmaschine
  sind automatisiert getestet (38 Prüfungen). Das Overlay ist übersetzt und
  gelinkt, aber nicht ausgeführt. Die JUCE-Dateien sind nicht übersetzt. Siehe
  [docs/05-tests.md](docs/05-tests.md).
