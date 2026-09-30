# Messungen: Definitionen und Grenzen

CITADEL erzeugt keine Messwerte. Ausgewertet werden ausschließlich aufgezeichnete Frametimes:

- **PresentMon-Aufnahme** (Desktop): Der Nutzer wählt die offizielle PresentMon-Konsolenanwendung
  (https://github.com/GameTechDev/PresentMon/releases). CITADEL startet sie zeitlich begrenzt mit
  `--process_name deadlock.exe --output_file <datei> --timed <s> --terminate_after_timed --stop_existing_session`.
  ETW-Aufzeichnung benötigt je nach System Administratorrechte oder die Gruppe „Leistungsprotokollbenutzer“.
  Schlägt die Aufnahme fehl, wird die Ausgabe von PresentMon unverändert angezeigt und der CSV-Import angeboten.
  **Ungetestet** in dieser Entwicklungsumgebung (kein Windows).
- **CSV-Import**: PresentMon 1.x/2.x, OCAT und CapFrameX-Exporte mit einer der Spalten `MsBetweenPresents`,
  `FrameTime` oder `MsBetweenDisplayChange` (in dieser Reihenfolge bevorzugt). Zeilen anderer Prozesse werden verworfen.

## Kennzahlen

| Kennzahl | Definition |
|---|---|
| Durchschnitts-FPS | Anzahl Frames ÷ Summe der Frametimes (s) – nicht das Mittel der Einzel-FPS |
| 1%-Low (Hauptwert) | 1000 ÷ 99. Perzentil der Frametimes (ms), lineare Interpolation (wie numpy/Excel `PERCENTILE.INC`) |
| 1%-Low (Ø) | 1000 ÷ Mittelwert der langsamsten 1 % Frames – nur ergänzend, weil verbreitet und oft verwechselt |
| P99-Frametime | 99. Perzentil der Frametimes in ms |
| Stotteranteil | Anteil Frames > 2 × Median-Frametime |

Aufwärmphase: Die ersten *n* Sekunden (Standard 10 s) werden verworfen, damit Shader-Kompilierung und Nachladen nicht
in den Vergleich eingehen.

## Vergleich

Ein Unterschied gilt nur als **klar**, wenn
1. je Variante mindestens 2 Läufe vorliegen,
2. sich die Wertebereiche (min–max) der Gruppen nicht überlappen und
3. die Differenz größer als die beobachtete Schwankung und mindestens 3 % ist.

Sonst zeigt die App „Kein klarer Vorteil“. Empfohlen: gleiche Szene (Sandbox/Hideout, gleiche Route), gleiche
Auflösung, Spielneustart nach Änderungen, mehrere Wiederholungen. Unterschiede zwischen beliebigen Matches beweisen
keinen kausalen Effekt einer Einstellung. FPS-Ziele sind Ziele, keine Garantie.

## Engpass-Hinweis

Nur mit PresentMon-2-Daten (`MsGPUBusy`/`GPUBusy`): Median-Anteil der GPU-Busy-Zeit an der Frametime.
≥ 90 % → „Wahrscheinlich GPU-limitiert“, ≤ 70 % → „Wahrscheinlich nicht GPU-limitiert“, dazwischen „Möglicher Engpass“ –
jeweils mit alternativen Erklärungen (FPS-Limit, V-Sync, Hintergrundlast). Ohne Messung: keine Aussage.
