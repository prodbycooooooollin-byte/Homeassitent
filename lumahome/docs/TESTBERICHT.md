# Testbericht

Stand 01.10.2026. **Es wurde kein Test an echten Geräten oder einer echten
Home-Assistant-Instanz durchgeführt.** Alle Live-Tests laufen gegen den
simulierten Home-Assistant-Server `tools/fake-ha/server.mjs`, der die genutzten
Teile der WebSocket-API nachbildet (Anmeldung, Zustände, Ereignisse,
Dienstaufrufe mit Kontext-ID, Registries, Statistiken, Verlauf,
Energie-Konfiguration). Die Steuerkette Browser → LumaHome-Server →
WebSocket → (simuliertes) Home Assistant → Zustandsereignis → Browser ist dabei
vollständig echt; simuliert ist nur die Gegenstelle.

## Automatisierte Abnahme (Playwright, `npm run test:e2e`)

Ergebnis des letzten Laufs: **11 von 11 bestanden** (Chromium 141 mit
Softwarerendering, Desktop 1366×860 und emuliertes Pixel 7 mit Touch).

| # | Abnahmepunkt | Test | Art | Ergebnis |
| --- | --- | --- | --- | --- |
| 1 | Zwei Räume erstellen, einrichten, speichern, nach Neuladen öffnen | `live.spec.ts` 1 – Raum per Aufziehen und per Maßeingabe, Sofa + Deckenleuchte, Prüfung der Serverdatei, Neuladen | Live-Modus, simuliertes HA | bestanden |
| 2 | Grundriss ändern → gleiche Änderung in 3D | `live.spec.ts` 2 – Breite 300 → 450 cm, Ausdehnung des Raumbodens im three.js-Szenengraph = 4,50 m | simuliert | bestanden |
| 3 | Möbel platzieren, verändern, rückgängig | `live.spec.ts` 3 – Sessel platzieren, Breite ändern, zweimal Rückgängig, Wiederholen | simuliert | bestanden |
| 4 | Lampe über Steuerkarte bedienen, bestätigten Zustand sehen | `live.spec.ts` 4 – Zuordnen im Werkzeug Verbinden, Klick auf die Leuchte im 3D-Modell, Schalter; „wird gesendet/warte auf Bestätigung“ → „Bestätigt“, Dienstaufruf beim (simulierten) HA geprüft | **simuliertes Gerät** | bestanden |
| 5 | Externe Geräteänderung empfangen | `live.spec.ts` 5 – Zustand im simulierten HA geändert, Karte zeigt „Aus“ ohne eigenen Befehl | simuliert | bestanden |
| 6 | Leistungssensor und Energiezähler mit korrekten Einheiten | `live.spec.ts` 6/8 – Sensor in **kW** wird als „1,25 kW“ gezeigt, Fernseher in W, Tagesenergie in kWh; Einheitenprüfung im Dialog | simuliert | bestanden |
| 7 | Verlauf mit erkennbaren Messlücken | `live.spec.ts` 7 – Lücke 02:00–05:00 erscheint als 3 schraffierte Stunden („Messlücke (3)“), Woche/Monat | simuliert | bestanden² |
| 8 | Übergeordneter Zähler ohne Doppelzählung | `live.spec.ts` 6/8 – Hausverbrauch = Hauszähler (nicht + Fernseher), Baum mit „nicht einzeln erfasst“, Rangliste nur Blätter; Zahlen zusätzlich per Unit-Test | simuliert | bestanden |
| 9 | Verbindungsabbruch und Wiederverbindung | `live.spec.ts` 9 – Verbindung getrennt und 4 s abgelehnt, Status „Getrennt – verbinde neu“ mit Grund, Änderung während des Ausfalls ist nach der Neusynchronisierung sichtbar | simuliert | bestanden |
| 10 | Export und vollständiger Import | `live.spec.ts` 10 – Export ohne Token, Raum gelöscht, ungültige Datei abgelehnt (Projekt bleibt), Import stellt Projekt identisch wieder her | simuliert | bestanden |
| 11 | Kernabläufe mit Touch | `touch.spec.ts` – Leuchte im Modell antippen → Panel unten, schalten, schließen; Raum per Touch-Ziehen zeichnen; Möbel per „Platzieren“; Energie-Verlauf | Demo-Modus, Touch-Emulation | bestanden |
| 12 | Ohne Kauf/Lizenz erreichbar | `free.spec.ts` – alle Katalogeinträge haben eine aktive „Platzieren“-Schaltfläche, keine Kauf-/Abo-/Lizenzbegriffe in allen vier Bereichen und im ausgelieferten Code | – | bestanden |

² Der Test wird automatisch übersprungen, wenn er vor 05:00 Uhr läuft (die simulierte Lücke liegt dann noch nicht vollständig in der Vergangenheit).

## Unit-Tests (Vitest, `npm test`): 65 bestanden

- **Geometrie:** Fläche, Punkt-im-Polygon, Selbstüberschneidung, Überlappung
  benachbarter Räume, Innennormalen, gemeinsame Innenwand genau einmal, offene
  Kanten, Fenster-/Türausschnitte (auch wenn der Nachbarraum die Wand erzeugt),
  Wandschnitt für die Innenansicht, Wand verschieben mit Nachbarraum,
  Rechteckmaße, Ecke einfügen/entfernen mit Öffnungen, Öffnung außerhalb der
  Wand + Einpassen, Raum löschen mit/ohne Inhalte, Kollision mit Wand,
  Überschneidung, akzeptierte Hinweise, Wand-Einrasten, Fangpunkte.
- **Energie:** W/kWh-Trennung, Einheitenprüfung, fehlende Werte ≠ 0,
  Hierarchie ohne Doppelzählung, Rest „nicht erfasst“, Raumzähler vs. erfasste
  Geräte, Kreisprüfung, Hausverbrauch aus Netz/PV/Speicher (Netz ≠ Haus),
  Netzbezug nur mit Bestätigung, kein erfundener Wert bei fehlendem Fluss,
  getrennte Integration von Netto-Flüssen, Statistiklücken, Zählerwechsel,
  Nichtverfügbarkeit mit Nachholwert, Leistungsintegration mit Lücke,
  Tag/Woche/Monat-Einteilung.
- **Geräte:** Fähigkeiten für Licht, Rollladen, Kontakt (inkl. Kippstellung),
  Heizung; unbekannt/nicht verfügbar/veraltet; Vorschläge; Dienstfreigabe.
- **Projektformat:** verlustfreier Export/Import, verständliche Ablehnung,
  neuere Formatversion, Verwerfen unbekannter Felder, Reparatur hängender Verweise.
- **Demo-Projekt:** gültig und ohne Plan-/Platzierungsfehler.
- **Kontraste:** alle Text-/Flächen-Kombinationen ≥ 4,5 : 1 (ein Befund wurde
  behoben, siehe `DESIGN.md`).

## Manuell geprüft (Screenshots im Container)

Zuhause/3D-Modell, Grundriss-Editor, Energie (Jetzt und Verlauf), Geräte,
Einstellungen mit Importfehler, Smartphone-Ansicht. Dabei gefundene und
behobene Fehler: Kamera im Hochformat zu nah, doppelte Übernahme einer
Zahleneingabe (Enter + Verlassen erzeugte zwei Rückgängig-Schritte),
Start auf neuem Gerät landete trotz vorhandenem Haus in der Einrichtung,
Lichtschimmer-Färbung im 2D-Plan.

## Nicht geprüft / verbleibende Einschränkungen

- **Keine echten Geräte, keine echte Home-Assistant-Instanz.** Abweichungen
  realer Integrationen (z. B. andere Attributnamen, fehlende Kontext-IDs in
  sehr alten HA-Versionen) sind nicht getestet. Fehlt die Kontext-ID, wird die
  nächste Zustandsänderung als Bestätigung gewertet.
- Kein Test auf echten Tablets/Handys oder echten GPUs; Touch nur emuliert.
  Safari/Firefox nicht getestet.
- Kein Import eigener 3D-Modelle; Möbel sind stilisierte Grundmodelle.
- Rollläden mit Lamellenwinkel (Tilt), Farbauswahl jenseits fester
  Farbvorschläge, Lüfter, Schlösser, Kameras und Präsenz werden nicht unterstützt.
- Möbel können in 3D verschoben, aber nur im 2D-Plan bzw. über Zahlenfelder
  gedreht und skaliert werden.
- Treppen sind ein Katalogobjekt plus Deckenöffnung, keine automatisch
  berechnete Treppe; Dach nur als flache Platte.
- Verlauf: Bucketgrenzen bei Zustandsverläufen (ohne Langzeitstatistik) werden
  nicht zeitanteilig aufgeteilt; ein Zählersprung wird der Stunde der späteren
  Messung zugeordnet. Rücksetzungserkennung: Rückgang > 10 %.
- Veraltet-Erkennung für Sensoren nur, wenn Home Assistant `last_reported` liefert (ab 2024.3).
- Draw-Calls (461 im Demo-Haus) sind noch nicht zusammengefasst – siehe `PERFORMANCE.md`.
- Ohne PIN kann jeder, der den Server erreicht, bearbeiten (Standard daher nur `127.0.0.1`).
