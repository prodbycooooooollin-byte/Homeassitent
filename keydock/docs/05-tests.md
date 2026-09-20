# 5. Teststatus — was geprüft ist und was nicht

**FL Studio stand nicht zur Verfügung.** Ich habe deshalb nichts als „im Host
getestet" bezeichnet, was ich nicht ausgeführt habe. Die Tabelle trennt drei
Stufen strikt.

Der Windows-Build läuft inzwischen in GitHub Actions auf `windows-2022` mit
MSVC — inklusive `ctest`. Was dort grün ist, gilt als geprüft; was FL Studio
selbst betrifft, weiterhin nicht.

Legende:
**A** = implementiert und automatisiert getestet ·
**B** = implementiert und übersetzt, Verhalten nicht geprüft ·
**C** = implementiert, im Host ungeprüft — bitte manuell abnehmen

## 5.1 Was ich tatsächlich ausgeführt habe

Linux, GCC 13, Release. `ctest`: **2/2 Suiten bestanden, 40 Einzelprüfungen,
0 Fehler** (26,8 s).

| # | Prüfung | Status | Ergebnis |
|---|---|---|---|
| 1 | C-Dur-Progression → C major | **A** | erkannt |
| 2 | F#-Moll-Progression (i–iv–V–i) → F# minor | **A** | erkannt |
| 3 | Camelot F# minor = 11A | **A** | korrekt |
| 4 | Drumloop 90 / 128 / 140 BPM → Audio-BPM | **A** | alle < 2 BPM Abweichung |
| 5 | Vollmix 128 BPM → 128 BPM aus dem Audio | **A** | < 2,5 BPM Abweichung |
| 6 | **Stille** → „ungeeignet", keine erfundene Tonart | **A** | `Unsuitable::silent` |
| 7 | Weißes Rauschen → keine sichere Tonart | **A** | Confidence `none` |
| 8 | Einzelner Dauerton → nie „sicher" | **A** | Key und Tempo gedeckelt |
| 9 | Reine Drums → nie sichere Tonart | **A** | gedeckelt |
| 10 | 2 s Audio → „zu kurz" statt Ergebnis | **A** | `Unsuitable::tooShort` |
| 11 | **Getrennte Samples vermischen sich nicht** | **A** | C-Dur, dann F#-Moll, beide korrekt |
| 12 | Wiederholung liefert dasselbe Ergebnis | **A** | deterministisch |
| 13 | Host-Sampleraten 44,1 / 48 / 96 kHz | **A** | alle korrekt |
| 14 | Ringpuffer: Round-Trip, `clear()`, Überlauf verwirft | **A** | kein Wachstum, kein Blockieren |
| 15 | Aufnahme ist hart auf die eingestellte Länge begrenzt | **A** | ≤ 10,05 s bei 10 s |
| 16 | Mehrdeutige Moll-Schleife (i–VI–III–VII) | **A** | Parallele erkannt, **nie „sicher"**, Hinweis gesetzt |
| 17 | `pushAudio` lässt den Aufrufer-Puffer bitgleich | **A** | unverändert |
| 18 | Ohne „Analysieren" wird nichts erfasst | **A** | bleibt „Bereit" |
| 19 | Stille hält den Zustand auf „Warte auf Audio" | **A** | bestätigt |
| 20 | Analyse startet beim ersten hörbaren Sample | **A** | stiller Vorlauf verworfen |
| 21 | **Neustart verwirft die vorherige Aufnahme** | **A** | neue `analysisId`, F#-Moll korrekt |
| 22 | Abbruch veröffentlicht nie ein Ergebnis | **A** | auch kein verspätetes |
| 23 | Manuelles Stoppen wertet das Erfasste aus | **A** | korrekt |
| 24 | Reset setzt auf „Bereit" zurück | **A** | bestätigt |
| 25 | Akkorde ohne Drums → nie sicheres Tempo | **A** | auf „unsicher" gedeckelt |
| 26 | Besser passende Tempo-Alternative wird erklärt | **A** | Hinweistext gesetzt |

Nachvollziehbar mit `ctest --test-dir build --output-on-failure`.

## 5.2 Selbst prüfen mit eigenen Dateien — `keydock-analyze`

Der schnellste Weg, die Analysequalität zu beurteilen: exportiere Tracks,
deren Tonart und Tempo du kennst, und lasse sie durch dieselbe Engine laufen,
die auch im Plugin steckt — **ohne Windows, ohne FL Studio, ohne VST3-Build**.

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j
./build/cli/keydock-analyze meintrack.wav
```

Mehrere Dateien und eine Tabelle für die Auswertung:

```bash
./build/cli/keydock-analyze --csv referenzen/*.wav > ergebnisse.csv
```

Nützliche Optionen:

| Option | Wirkung |
|---|---|
| `--seconds N` | nur die ersten N Sekunden auswerten (vergleichbar mit 10/20/30 s im Plugin) |
| `--offset N` | erst ab Sekunde N beginnen — praktisch, um das Intro zu überspringen |
| `--csv` | eine Zeile pro Datei statt Bericht |

Empfohlenes Vorgehen: 10–20 Tracks mit bekanntem Key/BPM sammeln, mit `--csv`
durchlaufen lassen und die Trefferquote zählen. Achte dabei besonders auf die
Sicherheitsstufe — ein falsches Ergebnis, das als „unsicher" markiert ist,
verhält sich wie vorgesehen; ein falsches Ergebnis mit „sicher" ist ein Fehler.

Beispielausgabe (aus generierten Referenzsignalen dieses Repos):

```
datei,tonart,camelot,tonart_sicherheit,bpm,bpm_sicherheit
t_fsminor_90.wav,F# minor,11A,sicher,89.9,nicht bestimmbar
t_mix_128.wav,A minor,8A,sicher,127.6,wahrscheinlich
t_drums_140.wav,,,nicht bestimmbar,139.7,wahrscheinlich
t_silence.wav,,,nicht bestimmbar,0.0,nicht bestimmbar
```

Gut ablesbar: reine Drums liefern **kein** Tonart-Ergebnis, Stille liefert gar
keines, und die Flächen-Datei ohne Perkussion bekommt beim Tempo „unsicher"
statt einer Scheingenauigkeit.

> **Unterschied zur Liveanalyse:** Das CLI bewertet eine **Datei**. Das Plugin
> bewertet das **live am Mixer-Slot ankommende** Signal, also inklusive der
> Effekte darüber. Die beiden können deshalb auseinanderlaufen — das ist
> gewollt und im Bericht auch so ausgewiesen („Quelle Datei, …").

## 5.3 Übersetzt und gelinkt, Verhalten ungeprüft

Mit `x86_64-w64-mingw32-g++ 13` gegen die echten Windows-Header übersetzt:

| Komponente | Status | Bemerkung |
|---|---|---|
| `KeyDockOverlay.exe` | **B** | Unter MSVC in CI warnungsfrei übersetzt und gelinkt; zusätzlich unter MinGW als PE32+-Binary. **Nie ausgeführt** — Fensterverhalten, Anheften, DPI und Fokus sind damit weiterhin ungeprüft. |
| `HostTracker`, `IpcServer`, `OverlayWindow`, `OverlayRender`, `Settings` | **B** | warnungsfrei übersetzt |
| `IpcClient`, `AnalysisController` (Windows-Pfad) | **B** | warnungsfrei übersetzt |
| `PluginProcessor`, `PluginEditor`, `OverlayLauncher` | **B** | Unter MSVC in CI warnungsfrei übersetzt, inklusive der `_WIN32`-Zweige. |
| Vollständiger MSVC-Build (VST3-Wrapper, Linker, Bundle) | **B** | Grün in CI: `KeyDock.vst3` wird als Bundle samt `Contents/Resources/moduleinfo.json` erzeugt. Dass FL Studio es lädt, ist damit **nicht** gezeigt. |
| Engine-Tests unter MSVC (`/fp:fast`) | **A** | `ctest` in CI: 2/2 Suiten, 40 Prüfungen, 0 Fehler — dieselben Ergebnisse wie unter GCC. |

> Der erste MSVC-Lauf scheiterte an etwas, das MinGW nicht zeigt: `windows.h`
> definiert `min`/`max` als Makros, wodurch jedes `std::max(` als `std::(`
> geparst wird (C2589/C2059). Behoben über `NOMINMAX`-Guards an jedem
> `windows.h`-Include plus Target-Definitionen in CMake. Das VST3 selbst war
> schon in diesem Lauf fehlerfrei gebaut — betroffen war nur das Overlay.
>
> Die Typprüfung gegen JUCE fand die Pfadauflösung des `OverlayLauncher`
> als echten Fehler: ein VST3 ist auf Windows ein Bundle, die DLL liegt also in
> `KeyDock.vst3/Contents/x86_64-win/`. Die Suche ging nur zwei Ebenen hoch, die
> dokumentierte Installation legt `KeyDockOverlay.exe` aber vier Ebenen höher
> neben das Bundle — das Overlay wäre nie gefunden worden. Jetzt wird bis zu
> fünf Ebenen nach außen gesucht, was Bundle- und Flach-Layout abdeckt.
>
> Was die Typprüfung **nicht** abdeckt: den VST3-Wrapper, das Linken und den
> Bundle-Aufbau. Das entscheidet sich erst im MSVC-Build.

## 5.4 Im Host ungeprüft — bitte manuell abnehmen

Dies ist der verbleibende Teil. Ein grüner CI-Build zeigt, dass das Plugin
übersetzt, gelinkt und als Bundle korrekt aufgebaut ist — **nicht**, dass FL
Studio es lädt, dass sich das Overlay anheftet oder dass der Audio-Durchlauf
bitgenau ist.

Konkrete Schritte, jeweils mit dem erwarteten Ergebnis.

### T1 — Unveränderter Audio-Durchlauf
1. Projekt mit Musik auf dem Master.
2. Ohne KeyDock als WAV exportieren → `a.wav`.
3. KeyDock auf Master-Slot 1, erneut exportieren → `b.wav`.
4. Beide in einem Editor gegeneinander phaseninvertiert summieren.

**Erwartet:** exakte Stille. Zusätzlich: `Options → General settings` zeigt
für KeyDock **0 ms** zusätzliche Latenz.

### T2 — Keine erfundenen Ergebnisse
1. Wiedergabe bei völliger Stille, „Analysieren".

**Erwartet:** „Warte auf Audio", danach „Zu wenig bzw. ungeeignetes
Audiomaterial". Kein Key, keine BPM.

2. Nur eine Drumloop ohne tonales Material analysieren.

**Erwartet:** BPM kommt, Tonart bleibt `--` oder wird als unsicher markiert.

### T3 — Audio-BPM statt Host-Tempo
1. Projekt-Tempo auf **170** stellen.
2. Eine Loop mit tatsächlich **128 BPM** abspielen (ohne Time-Stretch).

**Erwartet:** Anzeige ca. **128**, nicht 170. Im Detailpanel steht 170 separat
als „Projekt-Tempo … (nur Anzeige, kein Analyseergebnis)".

### T4 — Getrennte Analysen
1. Sample A solo → analysieren → Ergebnis notieren.
2. Auf Sample B umschalten → analysieren.

**Erwartet:** Ergebnis B, ohne jede Spur von A. Fortschrittsbalken beginnt bei
null.

### T5 — Analyse bei geschlossenem Plugin-Editor
1. Plugin-Fenster schließen.
2. Wiedergabe starten, im Overlay „Analysieren".

**Erwartet:** funktioniert unverändert.

### T6 — Projekt speichern und wieder öffnen
1. Analysieren, Projekt speichern, FL Studio schließen, Projekt öffnen.

**Erwartet:** Analysezeit-Einstellung und das letzte Ergebnis sind wieder da.

### T7 — Fensterverhalten
1. FL-Hauptfenster verschieben → Overlay wandert mit.
2. Maximieren/Wiederherstellen → Position relativ oben rechts bleibt.
3. FL minimieren → Overlay verschwindet.
4. Anderes Programm in den Vordergrund → Overlay verschwindet.
5. FL-Menü öffnen (z. B. Options) → Overlay verschwindet, verdeckt nichts.
6. FL auf einen Monitor mit **anderer Skalierung** ziehen (z. B. 100 % → 150 %).

**Erwartet:** Overlay skaliert mit und bleibt scharf.

### T8 — Fokus und Leertaste
1. Ins Overlay klicken.
2. Sofort Leertaste drücken.

**Erwartet:** FL startet/stoppt die Wiedergabe. Das Overlay hat den Fokus nie
übernommen.

### T9 — Mehrere Instanzen und Verbindungsabbruch
1. KeyDock auf Master **und** auf einen Insert-Kanal legen.

**Erwartet:** Im Detailpanel erscheint ein Instanz-Button; die gesteuerte
Instanz ist eindeutig benannt.

2. `KeyDockOverlay.exe` im Task-Manager beenden.

**Erwartet:** Audio läuft ununterbrochen weiter, der Plugin-Editor
funktioniert weiter. Bei der nächsten Analyse startet das Overlay neu.

3. Plugin aus dem Slot entfernen bzw. Projekt schließen.

**Erwartet:** Instanz verschwindet sauber aus dem Overlay.

### T10 — Offline-Rendering
1. Mit eingesetztem KeyDock als WAV exportieren.

**Erwartet:** Kein neues Live-Ergebnis, kein Fenster öffnet sich, Export
normal schnell.

## 5.5 Bewusst noch nicht gebaut

- **Dateianalyse im Plugin/Overlay.** Das Kommandozeilenwerkzeug
  `keydock-analyze` (Abschnitt 5.2) kann bereits Dateien auswerten, und das
  Protokoll hält mit `ResultMsg::sourceIsLive` die Quellen auseinander — die
  Anbindung an die Oberfläche fehlt aber noch.
- **Energy, Danceability** und ähnliche Zusatzwerte — laut Auftrag erst, wenn
  eine nachvollziehbare Berechnung dafür existiert.
- **Automatische Übernahme des FL-Studio-Themes.** Dafür ist keine verlässlich
  unterstützte Schnittstelle bekannt; stattdessen gibt es fünf mitgelieferte
  Themes und manuell editierbare Farben in `overlay.cfg`.
- **Automatische Erkennung freien Toolbar-Platzes.** Nicht zuverlässig
  möglich, deshalb der manuell umschaltbare Floating-Modus.
- **Themes als einzelne Dateien speichern/laden.** Aktuell wird das aktive
  Theme in `overlay.cfg` gespeichert; ein Dateibrowser dafür fehlt noch.

## 5.6 Kalibrierung der Sicherheitsangabe

Die Sicherheitsangabe ist eine **ordinale Stufe** (sicher / wahrscheinlich /
unsicher / nicht bestimmbar), **kein Prozentwert** — genau wie gefordert.

Der Schwellwert für die Dur/Moll-Parallelen-Mehrdeutigkeit wurde nicht
geraten, sondern am Testkorpus gemessen:

| Material | Ähnlichkeit zur Parallele |
|---|---|
| C-Dur I–V–vi–IV | 0,648 |
| A-Dur I–V–vi–IV | 0,664 |
| F#-Moll i–iv–V–i | 0,577 |
| A-Moll i–iv–V–i | 0,573 |
| **F#-Moll i–VI–III–VII (mehrdeutig)** | **0,784** |
| **A-Moll i–VI–III–VII (mehrdeutig)** | **0,782** |

Schwellwert **0,72** — mit Abstand zu beiden Gruppen. Oberhalb davon wird
„sicher" auf „wahrscheinlich" gedeckelt und ein Hinweistext gesetzt.

### Metrische Ebene beim Tempo

Beim Tempo gilt dasselbe Prinzip. Der Kontrastwert ignoriert bewusst
metrisch verwandte Tempi (halb, doppelt, 2/3, 3/2) — sonst würde jede
4/4-Figur sich selbst niederkonkurrieren. Dadurch konnte er aber nicht sehen,
wenn eine *verwandte* Ebene besser zum Signal passt als die vom Tempo-Prior
gewählte. Gemessen:

| Material | Salienz der besten Alternative |
|---|---|
| Vollmix mit Drums, 128 BPM (korrekt erkannt) | 1,01 — praktisch Gleichstand |
| Akkordfläche ohne Perkussion | 1,53 — Alternative passt klar besser |

Schwellwert **1,15**: darüber wird die Sicherheit auf „unsicher" gedeckelt und
ein Hinweis gesetzt, denn dann trennt nur noch der Prior die beiden Ebenen —
und ein Prior ist kein Messwert. Gefunden wurde das beim Testen mit
`keydock-analyze`, nicht durch die ursprüngliche Testsuite.

Das ist wichtig, weil `i–VI–III–VII` die häufigste Schleife moderner
Produktionen ist und **tonvorrats-identisch** mit ihrer Dur-Parallele: aus dem
Chroma allein ist die Entscheidung nicht zu treffen. KeyDock zeigt das an,
statt Sicherheit vorzutäuschen.
