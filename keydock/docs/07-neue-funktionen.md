# 7. Die neuen Funktionen

Vier Erweiterungen: Zieltonart, Rückblick, Feinstimmung und Tempo-Übergabe.
Alles Bestehende bleibt wie es war, und alles Neue ist in alten Projekten
**standardmäßig aus**.

---

## 7.1 Sample auf eine Zieltonart bringen

### Ablauf

1. Sample einzeln abspielen (andere Spuren stumm) und **Analysieren** drücken,
   **oder** den Rückblick-Pfeil links in der Leiste benutzen (7.2).
2. Einstellungen öffnen → Abschnitt **SAMPLE BEARBEITEN**.
3. Unter **Zieltonart** mit `−` / `+` den Grundton wählen, die Mitte schaltet
   zwischen Dur und Moll.
4. **Vorhören → Bearbeitet** schalten und vergleichen. **Original** spielt die
   unveränderte Aufnahme.
5. **Als WAV speichern** legt die Datei in `Dokumente\KeyDock` ab.

Länge und Tempo bleiben erhalten — es wird transponiert, nicht schneller
abgespielt. Gemessen liegt die Abweichung unter 0,1 Cent.

### Was nicht geht, und warum

**Dur lässt sich nicht in Moll transponieren.** Transponieren verschiebt
jeden Ton um dasselbe Intervall; das Muster aus Ganz- und Halbtonschritten —
also das, was Dur von Moll unterscheidet — bleibt dabei zwangsläufig gleich.
KeyDock zeigt in so einem Fall an, was stattdessen herauskäme, und wendet
**keine** Verschiebung an.

**„Andere Richtung"** wählt dieselbe Zieltonart eine Oktave anders herum, also
etwa −5 statt +7 Halbtöne. Nützlich, wenn eine Verschiebung zu weit geht.

**Bei unsicherer Erkennung** lässt sich die Ausgangstonart unter **Quelle** von
Hand setzen. **Automatisch** geht zur Erkennung zurück.

**Formanten** erhält die Klangfarbe beim Transponieren — sinnvoll bei Vocals.
Kostet Rechenzeit und ist deshalb abschaltbar.

### Vorhören ändert den Master

Vorhören **ersetzt** den Ausgang des Plugins, solange es eingeschaltet ist.
Das ist die einzige Situation außer einer ausdrücklich aktivierten Bearbeitung,
in der KeyDock das Audio verändert. Es ist in der Leiste und im Panel sichtbar
und schaltet sich nicht von selbst ein.

Solange Vorhören läuft, wird **nichts aufgezeichnet** — sonst würde eine neue
Analyse die Vorschau mitschneiden und die Bearbeitung in die nächste Messung
zurückfalten.

### Warum kein Playlist-Clip verändert wird

Das Plugin sitzt auf dem Master. Es sieht nur das Summensignal und hat
**keine dokumentierte Möglichkeit**, einen bestimmten Playlist-Clip zu
verändern. Deshalb der Weg über Aufnehmen → Bearbeiten → als neue WAV
speichern. Die Originaldatei bleibt unangetastet.

---

## 7.2 Rückblick: analysieren, was gerade lief

Einstellungen → **RÜCKBLICK** → **15 s**, **30 s** oder **60 s**.

Ab dann läuft ein Mitschnitt im Arbeitsspeicher mit. Der **Pfeil links in der
Leiste** übernimmt das Aufgezeichnete und analysiert es — ohne die Stelle
nochmal abspielen zu müssen.

- Die Zeile im Panel zeigt, wie viele Sekunden **tatsächlich** vorliegen.
- Unter 4 Sekunden wird abgelehnt statt geraten.
- Die Übernahme wird als **eigene Kopie** festgehalten, der weiterlaufende
  Mitschnitt kann sie nicht überschreiben.
- Der Ausschnitt lässt sich direkt für die Zieltonart weiterverwenden.
- **Leeren** verwirft den Inhalt, **Aus** gibt den Speicher frei.

Bei 60 Sekunden liegt der Verbrauch bei etwa 5 MB. **Nichts wird auf die
Festplatte geschrieben.** Ein Samplerate-Wechsel setzt den Puffer zurück.

---

## 7.3 Verstimmte Samples

Nach jeder Analyse steht unter **Feinstimmung**, ob das Sample zwischen den
Halbtönen liegt, zum Beispiel `−23 Cent gegenüber A440`.

- **Korrigieren** wendet die vorgeschlagene Gegenrichtung an (+23 Cent).
- **Cent −** / **Cent +** verschiebt zusätzlich von Hand.
- Beides ist vorhörbar und über **Verwerfen** rückgängig zu machen.

Halbtonverschiebung und Cent-Korrektur werden **getrennt geführt** und in einem
einzigen Durchgang angewendet. Eine Verstimmung kann daher nicht doppelt
korrigiert werden — dafür gibt es einen Test, der genau das nachweist.

**Wann keine Zahl erscheint:** Vibrato, Pitch-Bends, Drums oder verschieden
gestimmte Instrumente ergeben keine einheitliche Verstimmung. KeyDock schreibt
das hin, statt einen Mittelwert als „die" Verstimmung auszugeben.

---

## 7.4 Tempo an FL Studio übergeben

### Die technische Lage, ehrlich

**Ein VST3-Plugin kann das Host-Tempo nicht setzen.** Der `ProcessContext`
liefert das Tempo nur lesend; einen Rückweg sieht die Schnittstelle nicht vor.

FL Studio bietet aber einen dokumentierten Weg über seine
**MIDI-Controller-Scripting-API**:

```python
general.processRECEvent(midi.REC_Tempo, int(bpm * 1000),
                        midi.REC_Control | midi.REC_UpdateControl)
```

KeyDock nutzt genau den. Dafür braucht es ein kleines FL-Studio-Skript und
einen virtuellen MIDI-Port — Windows hat keine öffentliche Schnittstelle, um
selbst einen anzulegen.

### Einrichtung (einmalig)

**1. Virtuellen MIDI-Port anlegen**

[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html) (kostenlos)
installieren und einen Port anlegen, z. B. `KeyDock`.

**2. Skript installieren**

`integration/FLStudio/device_KeyDock.py` kopieren nach:

```
%USERPROFILE%\Documents\Image-Line\FL Studio\Settings\Hardware\KeyDock\device_KeyDock.py
```

Der Ordner `KeyDock` muss neu angelegt werden.

**3. In FL Studio zuweisen**

**Options → MIDI settings** → in **Input** den loopMIDI-Port auswählen,
**Enable** aktivieren und bei **Controller type** `KeyDock Tempo Bridge`
wählen.

**4. Im Overlay den Port wählen**

Einstellungen → **TEMPO AN FL STUDIO** → auf den Port-Knopf klicken, bis der
loopMIDI-Port dasteht. **Verbindung testen** drücken: FL Studio zeigt unten
„KeyDock verbunden".

### Benutzung

Neben der BPM-Zahl in der Leiste sitzt ein kleines **Häkchen**. Ein Klick
setzt das Projekttempo auf den **angezeigten** Wert — inklusive einer von dir
gewählten Half-/Double-Time-Ablesung. Eine kurze Bestätigung erscheint.

- Ohne Klick passiert **nichts**.
- Ohne gültiges Ergebnis ist das Häkchen inaktiv.
- Unsicherheit bleibt sichtbar: die Punkte neben dem Tempo verschwinden nicht.
- Erkanntes Audio-Tempo und Projekttempo bleiben getrennt; das Projekttempo
  steht weiterhin nur als Anzeigewert im Panel.

### Grenzen, die du kennen solltest

- **Ohne loopMIDI und Skript gibt es keine Übergabe.** Das Häkchen sagt dann
  „Kein MIDI-Port" und ändert nichts. Als Ersatz gibt es **Kopieren** im
  Abschnitt ERGEBNIS — ausdrücklich als Kopieren bezeichnet, nicht als
  Tempoübernahme.
- **Tempoautomation**: Schreibt dein Projekt das Tempo per Automation, gewinnt
  die Automation. KeyDock setzt denselben Wert wie ein Drehen am Tempo-Regler
  und kann Automation weder erkennen noch überschreiben. Prüfe das, bevor du
  dich darauf verlässt.
- **Rückgängig**: Das Setzen läuft über FL Studios eigenen REC-Mechanismus,
  also greift **Strg+Z** in FL Studio. Ein eigenes Undo hat KeyDock nicht.
- KeyDock ändert **keine** Clip-Pitch- oder Stretch-Einstellungen. Was FL
  Studio beim Tempowechsel mit Clips macht, bleibt FL Studios normales
  Verhalten.

---

## 7.5 Live-Pitch auf dem Eingangssignal

**Nicht enthalten.** Das war ausdrücklich als Option gewünscht, und ich habe es
bewusst weggelassen: ein Echtzeit-Phase-Vocoder auf dem Master-Bus, den ich
nicht in FL Studio testen kann, riskiert Aussetzer in deinem Mix. Die
Bearbeitung läuft deshalb offline auf einem aufgenommenen Ausschnitt, wo sie
messbar korrekt ist.

`EditStateMsg::livePitchActive` ist im Protokoll bereits vorgesehen, falls das
später dazukommt.

---

## 7.6 Kompatibilität

- **Alte Projekte** verhalten sich unverändert: Rückblick aus, keine Zieltonart,
  Vorhören aus, kein Pitch-Shift.
- Im normalen Analysemodus wird Audio weiterhin **unverändert** durchgereicht,
  mit 0 ms zusätzlicher Latenz.
- Vorhören ersetzt den Ausgang, statt ihn zu verarbeiten, erzeugt also
  ebenfalls keine Latenz.
- Offline-Rendering löst weiterhin keine Analyse und keine Fenster aus.
