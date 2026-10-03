# 2. Architektur

## 2.1 Thread-Modell

Die harte Regel: **der Audio-Thread rechnet nichts.**

| Thread | Aufgabe | Erlaubt |
|---|---|---|
| Audio (`processBlock`) | Kanäle zu Mono summieren, Peak merken, in Ringpuffer schreiben | Keine Allokation, keine Locks, kein Dateizugriff, keine UI |
| Worker (`AnalysisController`) | Ringpuffer leeren, resampeln, Engine ausführen | Allokation ok (Puffer sind vorreserviert) |
| IPC (`IpcClient`) | Named-Pipe-Verbindung, Nachrichten senden/empfangen | Blockierende I/O ok |
| Message (JUCE) | Editor, Kommandos | — |

Die Übergabe Audio → Worker läuft über `RingBuffer`, einen Lock-freien
SPSC-FIFO mit fester Kapazität (2 Sekunden Hostmaterial). Läuft er über,
werden Samples **verworfen** statt zu blockieren — der umgekehrte Fall wäre
ein Dropout im Master.

Das Resampling auf 22 050 Hz passiert im Worker, nicht im Audio-Thread, und
betrifft ausschließlich den Analysepfad.

## 2.2 Audio-Transparenz

`processBlock` schreibt **nie** in den Puffer. Es gibt keinen Gain, keinen
Filter, keine Kopie zurück. `setLatencySamples(0)` wird in `prepareToPlay`
gesetzt; die Analyse liegt vollständig neben dem Signalweg.

Bei `isNonRealtime()` — also beim Offline-Rendering/Export — kehrt
`processBlock` sofort zurück: keine Erfassung, keine Live-Ergebnisse, kein
Fensterstart.

## 2.3 Frische Analysen und veraltete Ergebnisse

Jede Analyse hat eine monoton steigende `analysisId`.

- `startAnalysis()` erhöht die Id. Der Worker erkennt das, **leert den
  Ringpuffer und setzt die Engine komplett zurück** — es kann kein Sample der
  vorherigen Aufnahme überleben.
- Nach der Auswertung prüft der Worker, ob die Id noch aktuell ist. Ist sie
  es nicht, wird das Ergebnis **verworfen**. Ein spätes Ergebnis einer
  abgebrochenen Analyse kann ein neueres nicht überschreiben.
- Der `IpcServer` im Overlay verwirft zusätzlich Ergebnisse mit kleinerer
  `analysisId`, als bereits angezeigt wird.

Genau das prüfen die Tests unter „A new analysis discards the previous
capture" und „Cancel leaves no stale result behind".

## 2.4 Warte auf Audio

Bei Stille bleibt der Zustand auf **Warte auf Audio**. Erst beim ersten
hörbaren Sample (> ca. −56 dBFS) startet die Erfassung *neu* — ein langer
stiller Vorlauf frisst das Analysefenster also nicht auf. Das funktioniert
auch, wenn die Wiedergabe bereits läuft, weil der Trigger am Signal hängt und
nicht am Transport.

## 2.5 Host-Tempo bleibt getrennt

Das Projekt-Tempo wird über `getPlayHead()` gelesen und **ausschließlich als
Anzeigewert** weitergereicht (`StateMsg::hostBpm`, im Detailpanel als
„Projekt-Tempo … (nur Anzeige, kein Analyseergebnis)"). Es erreicht die Engine
nie: `AnalysisEngine` hat keinerlei Schnittstelle, über die ein Host-Tempo
hineingegeben werden könnte.

Die Buttons `1/2` und `x2` im Overlay ändern nur `bpmDisplayFactor_` — also
die Darstellung. Sie starten keine neue Analyse und schreiben nichts in FL
Studios Tempo.

## 2.6 Overlay-Positionierung

- **Angeheftet (Standard):** Position als Versatz zur **oberen rechten Ecke**
  des FL-Hauptfensters, gespeichert in DIPs. Verschieben, Größenänderung und
  Maximieren werden dadurch automatisch mitgemacht.
- **Frei:** absolute Desktop-Position. Für „Single Line"-Presets, kleine
  Fenster oder belegte Bereiche. **Manuell umschaltbar** im Detailpanel — eine
  automatische Erkennung freien Toolbar-Platzes wurde bewusst nicht gebaut,
  weil sie nicht zuverlässig möglich ist (siehe `docs/01-machbarkeit.md`).

Verfolgt wird das Hostfenster über `SetWinEventHook` für
`EVENT_OBJECT_LOCATIONCHANGE`, `EVENT_SYSTEM_FOREGROUND`,
`EVENT_SYSTEM_MINIMIZESTART/END` und `EVENT_SYSTEM_MENUSTART/MENUPOPUPEND`,
ergänzt um einen 100-ms-Timer als Sicherheitsnetz. DPI kommt aus
`GetDpiForWindow` pro Monitor; das Fenster ist `PER_MONITOR_AWARE_V2` und
reagiert auf `WM_DPICHANGED`.

Sichtbar ist das Overlay nur, wenn **alle** Bedingungen gelten: FL-Fenster
existiert, ist nicht minimiert, FL (oder das Overlay) hat den Vordergrund,
kein Menü ist offen, und kein FL-Popup überlappt die Overlay-Fläche.

## 2.7 Fokus und Tastatur

- `WS_EX_NOACTIVATE` und `WM_MOUSEACTIVATE → MA_NOACTIVATE`: das Overlay
  übernimmt beim Anzeigen **und** beim Anklicken keinen Tastaturfokus. Die
  Leertaste und andere FL-Shortcuts bleiben damit bei FL Studio.
- `WS_EX_TOOLWINDOW`: kein Taskbar- und kein Alt-Tab-Eintrag.
- Das Fenster ist exakt so groß wie seine Oberfläche, plus abgerundete Region
  über `SetWindowRgn`. Außerhalb der sichtbaren Fläche gibt es nichts, was
  Klicks abfangen könnte.

## 2.8 Mehrere Instanzen

Jede Plugin-Instanz meldet sich mit `instanceId = (PID << 32) | Zähler` und
einem Anzeigenamen. Das Overlay steuert immer **genau eine** Instanz:

1. die vom Benutzer im Detailpanel gewählte, solange sie verbunden ist;
2. sonst diejenige, die zuletzt Audio gesehen hat.

Der Instanz-Button erscheint nur, wenn mehr als eine verbunden ist. Instanzen,
die sich 5 Sekunden nicht gemeldet haben, verschwinden aus der Liste — ein
abgestürztes FL Studio hinterlässt also keine Karteileiche.

## 2.9 Ausfall des Overlays

`IpcClient` läuft rein im Hintergrund. Ist keine Pipe da, versucht er alle
500 ms neu und bittet höchstens alle 5 Sekunden den `OverlayLauncher`, eines
zu starten. Der Audiopfad und der eingebaute Plugin-Editor sind davon in
keiner Weise betroffen. Die Sendewarteschlange ist auf 64 Nachrichten
begrenzt; bei einem hängenden Overlay werden die ältesten verworfen.

## 2.10 Lebenszyklus des Overlays

Der `OverlayLauncher` startet `KeyDockOverlay.exe` **nicht** im Konstruktor,
sondern erst, wenn echtes Echtzeit-Audio verarbeitet wurde oder der Benutzer
„Analysieren" geklickt hat. Dadurch öffnet der **Plugin-Scan kein Fenster**.
Ein `Local\KeyDock.Overlay.Singleton.v1`-Mutex stellt sicher, dass genau ein
Overlay läuft, egal wie viele Instanzen oder FL-Studio-Prozesse es gibt.
