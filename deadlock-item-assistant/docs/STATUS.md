# Ehrlicher Stand (27.09.2026, Version 0.2.0)

## Neu in 0.2.0

- **Automatik:** Der neue Standard ist die Quelle „Automatisch“. Nutzt Overwolf-Spielevents über ow-electron, wenn vorhanden; sonst Spectator-Fallback mit automatischer Konto- und Match-Suche.
- **GEP-Provider:** mit simulierten Events nach dem dokumentierten Schema getestet (`test/gep.test.ts`, 6 Tests). **Nicht mit echtem ow-electron und Spiel getestet.**
- **Budget:**
  - direkt gemessen, sobald die Bedeutung von „souls“ erkannt ist
  - sonst berechnet (Gesamt-Souls − Itemwert − Verkaufsverluste), angezeigt als „bezahlbar (berechnet)“ und nie als „sicher bezahlbar“
- **Design:** Deadlock-Farbwelt aus den Panorama-Styles des Spiels, mitgelieferte OFL-Schriften (Barlow Condensed, Cinzel), neue Screenshots.
- **Windows-Build:** Der Workflow baut zusätzlich die Variante „Auto“ mit ow-electron, unsigniert (`overwolf.requireSigning=false`). Overwolf-Signierung braucht registrierte App-Schlüssel. Ob die Spielevents in der unsignierten Installation per Dev Mode laden, ist **auf Windows noch zu prüfen**. Sicherer Weg: aus dem Quellcode `npm run start:ow` mit gesetztem `OW_DEV_KEY` starten.


## Mit echten Daten geprüft

- **Spieldaten:** Items und Heroes wurden aus den echten Spieldateien extrahiert (Build 6701, 25.09.2026, 156 Shop-Items, 38 Heroes).
  - Belegt: Preise je Stufe, Komponenten, Eigenschaften, Beschreibungen, Hero-IDs.
  - Stichprobe: Die Werte von Indomitable (6.400, 10 %/10 % Resistenzen, 55 s, 325 Barriere) stimmen mit unabhängigen Webquellen überein.
- **Mechaniken:** Alle kuratierten Spezialeffekte passen zu Eigenschaften bzw. Beschreibungstexten dieses Builds (Test `gamedata.test.ts`).

## Nur mit Test- oder Beispieldaten geprüft

- **Bewertungslogik:** alle 13 Szenarien aus dem Auftrag als automatisierte Tests (`test/scenarios.test.ts`, `test/store.test.ts`).
- **Spectator-Provider:** geprüft gegen das Event-Schema aus dem Quellcode und über einen lokalen SSE-Mock-Server, **nicht gegen ein echtes Match**. Offen sind:
  - die Item-ID-Zuordnung (MurmurHash2-Annahme)
  - ob die Item-Liste des Streams verkaufte Items enthält
  - die tatsächliche Verzögerung
  - ob die eigene Account-ID im Stream erscheint
- **Schnelleingabe und Demo:** funktionsfähig, mit Beispieleinträgen.
- **Oberfläche:** echte Electron-Fenster unter Linux/Xvfb per Screenshot geprüft (`docs/screenshots`). **Nicht unter Windows und nicht über dem Spiel.**
- **Leistung:** unter Linux/Xvfb ohne Spiel gemessen (siehe unten). **Kein FPS- oder Frametime-Test.**

## Blockiert oder offen

1. **Automatische Live-Anbindung (0.1.0-Stand, durch 0.2.0 ersetzt).** Früher lieferte keine zulässige Quelle das Budget automatisch.
   - Overwolf scheidet für ein privates Tool aus.
   - Der Spectator-Stream liefert nur den Gesamtwert.
   - Das Budget kommt daher aus der Schnelleingabe oder bleibt „unbekannt“.
2. **Eigene Match-ID** für den Spectator-Stream. Automatisch nur über die Top-200-Liste. Sonst muss sie manuell eingetragen werden; wo sie im Spiel sichtbar ist, ist unbestätigt.
3. **Schaden gegen mich.** Keine Quelle ohne Overwolf. Die Engine unterstützt Schadensfenster, sie werden aber nie gefüllt.
4. **OCR/Bildschirmerkennung.** Nicht umgesetzt, weil keine echten Screenshots zur Verifikation vorlagen.
5. **Windows-Verhalten.** Folgendes ist nur als Code umgesetzt und nicht auf Windows geprüft:
   - Klickdurchlässigkeit (`setIgnoreMouseEvents`)
   - Fokus (`focusable:false`, `showInactive`)
   - globale Hotkeys
   - DPI- und Monitorwechsel
   - Acrylic-Unschärfe

   Exklusiver Vollbildmodus ist **nicht** unterstützt oder verifiziert; das Spiel sollte im randlosen Fenstermodus laufen.
6. **Deutsche Itemnamen und Icons.** Der Abgleich über `api.deadlock-api.com/v1/assets` ist implementiert, aber ungetestet (Host gesperrt). Ohne Abgleich erscheinen die englischen Originalnamen und gestaltete Ersatzsymbole.
7. **Fachliche Validierung.** Gewichte und Hero-Profile sind Einschätzungen. Die Profile neuerer Heroes haben einen niedrigen Sicherheitsgrad. Erfahrene Spieler sollten die Szenario-Empfehlungen prüfen.

## Test- und Leistungsresultate

- `npm test`: **37/37 bestanden**. Das umfasst KV3-Parser, Datensatz-Invarianten, 15 Szenarien, 8 Store-Tests, 6 Provider-Tests (inkl. SSE-Mock) und 2 Anzeige-Tests.
- `npm run typecheck`: ohne Fehler.
- **Leistung:** Linux, Xvfb (Software-Rendering), 4 vCPU Xeon 2,8 GHz, Electron 33.4.11, Demo-Modus mit Updates im Sekundentakt. Summe aller App-Prozesse laut `app.getAppMetrics`; CPU in Prozent eines Kerns.

  | Messung | CPU Ø | CPU max | RAM Ø | GPU-Prozess CPU Ø |
  |---|---|---|---|---|
  | nur Overlay (60 s) | 0,6 % | 1,5 % | 447 MB | 0,06 % |
  | Overlay + Einstellungsfenster (45 s) | 2,0 % | 3,7 % | 596 MB | 0,3 % |

  Die Rohdaten stehen in `docs/measurements/`. Ein Einfluss auf die FPS des Spiels wurde **nicht** gemessen, weil kein Spiel lief.
- **Windows-Build:** Der GitHub-Workflow `release-deadlock-item-assistant.yml` lief auf `windows-latest` erfolgreich durch: Typprüfung, alle Tests, NSIS-Installer und portable EXE, Pre-Release `dia-v0.1.0`. Unter Linux ließ sich die portable EXE zusätzlich mit Wine64 bauen.
  Die EXE wurde **nicht** interaktiv unter Windows gestartet; der Workflow baut und testet nur.
