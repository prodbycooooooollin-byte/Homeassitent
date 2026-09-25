# 1. Machbarkeitsbewertung und Architekturentscheidung

Stand: September 2026. Diese Bewertung wurde vor der Implementierung erstellt
und hat die Architektur festgelegt.

## 1.1 Kann ein Plugin ein Feld in der FL-Studio-Toolbar erzeugen?

**Nein — es gibt dafür keine offiziell unterstützte Schnittstelle.**

Die drei vom Auftrag geforderten Varianten unterscheiden sich so:

| Variante | Machbar? | Begründung |
|---|---|---|
| **Nativ eingebautes Toolbar-Element** | Nein | Image-Line veröffentlicht zwar ein FL Plugin SDK für native FL-Plugins (Delphi/Visual C++), dessen Umfang ist aber die Erstellung von Generator- und Effekt-Plugins samt eigenem Plugin-Fenster. Weder das FL Plugin SDK noch die MIDI-Scripting-API dokumentieren einen Einhängepunkt für eigene Toolbar-Panels. Die Toolbar-Panels sind ein fest eingebauter Teil der Hauptoberfläche. |
| **Separates, optisch angeheftetes Overlay** | **Ja** | Ein eigenes, rahmenloses Top-Level-Fenster, das per dokumentierter Win32-API dem FL-Hauptfenster folgt. Kein Eingriff in FL Studio. |
| **Gewöhnliches schwebendes Pluginfenster** | Ja, erfüllt aber die Anforderung nicht | Der Plugin-Editor ist an das Pluginfenster gebunden und liegt nicht oben rechts. |

> **Wichtige Einschränkung ehrlich benannt:** `image-line.com` ist aus meiner
> Build-Umgebung durch den Netzwerk-Proxy blockiert. Ich konnte die
> Entwicklerseite und das Toolbar-Handbuchkapitel **nicht direkt abrufen**.
> Die Aussage oben stützt sich auf Suchergebnis-Zusammenfassungen dieser
> Seiten und auf das öffentlich bekannte Format des FL Plugin SDK. Bevor du
> dich endgültig festlegst, prüfe bitte selbst
> <https://www.image-line.com/developers>. **Falls dort doch eine Toolbar-API
> auftaucht, ist nur die Positionierungsschicht auszutauschen** — Engine,
> Plugin und Protokoll bleiben unverändert.

**Entscheidung: rahmenloses Overlay als Hauptlösung**, wie im Auftrag für
diesen Fall vorgesehen. Bewusst *nicht* gewählt wurden DLL-Injection,
Subclassing von FL-Studio-Fenstern oder das Patchen von Programmdateien: alles
drei bricht bei jedem FL-Update, gilt vielen Virenscannern als verdächtig und
war ausdrücklich ausgeschlossen.

## 1.2 Architektur

Zwei Prozesse, verbunden über eine Named Pipe:

```
FL Studio (Prozess)                        KeyDockOverlay.exe (Prozess)
┌────────────────────────────┐             ┌──────────────────────────┐
│ KeyDock.vst3               │             │ Win32-Overlay            │
│  Audio-Thread              │             │  - folgt FL-Hauptfenster │
│   └─ nur mono-summieren    │             │  - zeichnet Key/BPM      │
│      + Ringpuffer-Push     │             │  - sendet Kommandos      │
│  Worker-Thread             │   Named     │                          │
│   └─ Resampling + Engine   │◄──Pipe─────►│  IpcServer               │
│  IPC-Thread                │  KeyDock.v1 │   (1 Overlay : n Plugins)│
└────────────────────────────┘             └──────────────────────────┘
```

**Warum zwei Prozesse statt einem?** Das Overlay muss existieren, auch wenn
der Plugin-Editor geschlossen ist, und es darf beim Verschieben oder
Minimieren von FL Studio nicht am Lebenszyklus eines Plugin-Fensters hängen.
Ein eigener Prozess entkoppelt das sauber; zusätzlich kann ein Absturz des
Overlays den Audiopfad prinzipiell nicht unterbrechen.

**Warum eine Named Pipe?** Dokumentiert, in Windows eingebaut, unterstützt
mehrere Clients an einem Endpunkt und erlaubt Nachrichtenmodus mit
POD-Strukturen fester Größe. Der Audio-Thread berührt die Pipe nie — es gibt
eine explizite Thread-Trennung (siehe `docs/02-architektur.md`).

## 1.3 Analyse-Engine: warum nicht Essentia

Der Auftrag nennt Essentia (`KeyExtractor`, `RhythmExtractor2013`) als
Kandidaten. Geprüft und **verworfen**, aus drei Gründen:

1. **Lizenz.** Essentia steht unter der **AGPL-3.0**; eine proprietäre Lizenz
   gibt es nur auf Anfrage bei der Music Technology Group der Universitat
   Pompeu Fabra. Die AGPL ist für ein Closed-Source-Plugin, das du
   möglicherweise verkaufen willst, praktisch nicht tragbar.
2. **Windows-Toolchain.** Essentia ist primär auf Linux/macOS ausgelegt und
   zieht FFmpeg, TagLib, libsamplerate, Eigen und weitere Abhängigkeiten nach.
   Das in einen VST3-Build unter MSVC zu bekommen ist ein eigenes Projekt.
3. **Größe.** Für genau zwei Messgrößen — Key und BPM — ist die vollständige
   MIR-Bibliothek unverhältnismäßig.

**Entscheidung: eigene Engine**, aber mit echten, benannten Verfahren, nicht
mit Lautstärkemessung oder „dominanter Frequenz":

- **Tonart:** STFT → spektrale Peak-Erkennung mit parabolischer Interpolation
  → harmonisch gewichtetes HPCP mit 36 Bins (1/3 Halbton) → Stimmungsschätzung
  → 12-Bin-Chroma → Korrelation gegen ein Ensemble aus **Temperley-(2001)-** und
  **Krumhansl-Kessler-Profilen**.
- **Tempo:** mehrbandiger **Spectral-Flux-Onset-Detector** mit
  Log-Kompression → adaptive Mittelwertentfernung → Autokorrelation →
  **Kammfilter-Salienz** über vier Vielfache → schwacher log-normaler
  Tempo-Prior → Beat-Grid-Phasenprüfung.

Beide sind Standardverfahren aus der MIR-Literatur. Eine
Metadaten-API für veröffentlichte Songs (Tunebat, Spotify o. ä.) wäre kein
Ersatz: sie kennt dein Master-Signal nicht. Tunebats eigener Analyzer nutzt
laut dessen FAQ Essentia.js lokal im Browser und bietet keine öffentliche API;
entsprechend wird hier **nichts gescrapt und kein undokumentierter Endpunkt
angesprochen**.

## 1.4 Plugin-Framework

**JUCE 8 + CMake**, wie vorgeschlagen. Geprüfte Rahmenbedingungen:

- Die JUCE-Module sind **dual lizenziert: AGPLv3 oder kommerzielle
  JUCE-Lizenz**. Überschreitest du das Umsatzlimit deiner Stufe, gilt für die
  weitere Verbreitung die GPLv3. Für ein internes Werkzeug ist das unkritisch,
  für ein Produkt nicht.
- Das **VST 3 SDK steht inzwischen unter MIT** — die früheren Optionen GPLv3
  bzw. proprietäre Steinberg-Lizenz gibt es laut SDK-Repository nicht mehr.
  Das ist die angenehmste Nachricht dieser Prüfung.

Details und Konsequenzen in `docs/06-lizenzen.md`.

**Die Analyse-Engine hängt bewusst an keinem der beiden.** Sie ist reines
C++17 ohne Abhängigkeiten und mit eigener FFT — dadurch ist sie plattformweit
testbar (was für die Abnahme entscheidend war) und bliebe auch nutzbar, wenn du
JUCE später ersetzen willst.

## Quellen

- [VST 3 SDK — Repository (Lizenzangabe)](https://github.com/steinbergmedia/vst3sdk)
- [The JUCE 8 End User Licence Agreement](https://juce.com/legal/juce-8-licence/)
- [JUCE — LICENSE.md](https://github.com/juce-framework/JUCE/blob/master/LICENSE.md)
- [Get JUCE (Lizenzstufen)](https://juce.com/get-juce/)
- [ESSENTIA: an Open-Source Library for Sound and Music Analysis](http://www.justinsalamon.com/uploads/4/3/9/4/4394963/bogdanov_essentia_acmmm13.pdf)
- [Essentia — Überblick und Lizenz](https://grokipedia.com/page/Essentia_audio_analysis_library)
- [Image-Line — Developers (nicht direkt abrufbar, siehe Hinweis oben)](https://www.image-line.com/developers)
- [FL Studio Handbuch — Toolbar Panels (nicht direkt abrufbar)](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/toolbar_panels.htm)
