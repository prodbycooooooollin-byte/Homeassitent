# 4. Einrichtung in FL Studio

Einmal einrichten, danach bei jedem neuen Projekt sofort loslegen.

## 4.1 Plugin installieren und scannen

1. `KeyDock.vst3` und `KeyDockOverlay.exe` in dasselbe VST3-Verzeichnis legen
   (siehe `docs/03-build.md`, 3.4).
2. FL Studio starten.
3. **Options → Manage plugins**.
4. Bei **Plugin search paths** sicherstellen, dass dein VST3-Ordner gelistet
   ist.
5. **Find more plugins** klicken. KeyDock erscheint als Effekt.
6. In der Plugin-Datenbank KeyDock als **Favorite** markieren, dann taucht es
   im Mixer-Menü direkt auf.

Der Scan öffnet **kein** Overlay-Fenster — das Overlay startet erst, wenn
wirklich Audio verarbeitet oder „Analysieren" geklickt wird.

## 4.2 Auf den Master legen und den richtigen Slot wählen

1. Mixer öffnen (**F9**).
2. **Master**-Kanal auswählen.
3. Einen freien Effekt-Slot anklicken → **KeyDock** wählen.

**Welcher Slot — und warum das wichtig ist:**

KeyDock analysiert ausschließlich das Signal, **das an seinem eigenen
Mixer-Slot ankommt**. Die Effekte in den Slots *darüber* haben es also bereits
bearbeitet.

| Slot-Position | Was analysiert wird |
|---|---|
| **Slot 1 (ganz oben)** | Die rohe Summe aller Mixer-Kanäle, vor jeder Master-Bearbeitung. |
| **Nach EQ/Sättigung** | Das Signal inklusive dieser Bearbeitung. |
| **Nach einem Pitch-Shifter** | Die **verschobene** Tonart — nicht die des Ausgangsmaterials. |
| **Nach einem starken Limiter** | Transienten sind gestaucht, die BPM-Erkennung wird schwächer. |

**Empfehlung: Slot 1.** Das ist am nächsten am tatsächlichen Material und am
wenigsten von Master-Bearbeitung verfälscht. Willst du bewusst beurteilen, was
am Ende *herauskommt*, setze KeyDock stattdessen ganz nach unten — das ist die
im Auftrag gemeinte „Liveanalyse des aktuell hörbaren, gegebenenfalls
bearbeiteten Sounds".

## 4.3 Als Projektvorlage speichern

1. Projekt so einrichten, wie du starten willst (KeyDock auf dem Master, sonst
   leer).
2. **File → Save as…**
3. In den Vorlagenordner speichern:

   ```
   %USERPROFILE%\Documents\Image-Line\FL Studio\Settings\Templates\KeyDock\KeyDock.flp
   ```

   Der Ordnername (`KeyDock`) wird später im Vorlagenmenü als Kategorie
   angezeigt.

## 4.4 Als Standardvorlage und Startmodus einstellen

1. **Options → General settings**.
2. Bei **Startup** den Startmodus auf **Open template** (statt „Empty
   project") setzen.
3. Als Vorlage die eben gespeicherte `KeyDock`-Vorlage wählen.

Ab jetzt hat jedes **neu** angelegte Projekt KeyDock bereits auf dem Master.

## 4.5 Bestehende Projekte

Die Vorlage ändert **bestehende Projekte nicht** nachträglich — FLP-Dateien
sind eigenständig gespeichert. Für ein bereits vorhandenes Projekt einmalig:

1. Projekt öffnen.
2. **F9** → **Master** → freier Slot → **KeyDock**.
3. Projekt speichern.

Die KeyDock-Einstellungen und das zuletzt gezeigte Ergebnis werden im Projekt
mitgespeichert und beim Öffnen wiederhergestellt.

## 4.6 Overlay einmal positionieren

1. Wiedergabe starten, damit das Overlay erscheint (oder einmal „Analysieren"
   klicken).
2. Das Overlay erscheint oben rechts am FL-Hauptfenster.
3. Am **Griff ganz links** (der farbige Balken) ziehen, um es zu
   positionieren.
4. Am **Griff ganz rechts** (`⋮`) ziehen, um die Breite anzupassen.
5. Über `⌄` das Detailpanel öffnen. Dort:
   - **Angeheftet / Frei** umschalten — „Frei" ist für „Single Line",
     kleine Fenster oder belegte Toolbar-Bereiche gedacht;
   - **Theme** durchschalten;
   - **`−` / `+`** skaliert die Oberfläche zusätzlich zur System-DPI;
   - **Camelot an/aus**;
   - Analysezeit durchschalten (10 s → 20 s → 30 s → manuell).

Position, Breite, Skalierung und Theme werden in
`%APPDATA%\KeyDock\overlay.cfg` gespeichert und beim nächsten Start
wiederhergestellt.

## 4.7 Der eigentliche Arbeitsablauf

1. Song oder Sample abspielen.
2. Oben rechts **Analysieren** klicken.
3. Key und BPM ablesen.
4. Für ein anderes Sample: die entsprechenden Playlist-Spuren selbst
   stummschalten bzw. solo schalten und erneut **Analysieren** klicken.

> **Wichtig, ehrlich gesagt:** KeyDock kennt über das Master-Signal **nicht**
> die Namen oder Solo-Zustände einzelner Playlist-Spuren. Es analysiert
> ausschließlich, was am Plugin ankommt. Welche Spuren das sind, entscheidest
> du über Mute/Solo. Das Werkzeug behauptet nicht, selbstständig „die
> ausgewählte Spur" zu analysieren.
