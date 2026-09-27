# Ehrlicher Stand (27.09.2026, Version 0.3.0)

## Neu in 0.3.0: Bildschirmerkennung

- **Warum:** Overwolf gibt Spielevents nur für von Overwolf genehmigte Apps frei; die Entwicklerkonsole war für dich nicht nutzbar. Die Anleitung aus 0.2.0 („eigenen Schlüssel anlegen“) war falsch und ist entfernt.
- **Was:** „Automatisch“ liest jetzt das HUD: nicht ausgegebene Souls, Boons, eigene Items, Heldenporträts und bei gedrückter Tab-Taste die Item-Spalten. Lokal, nur während Deadlock läuft, ohne Speichern.
- **Korrektur nach Hinweis des Nutzers:** Die erste Fassung hielt die Zahl im runden Zähler für die Souls. Das sind aber die Boons. Die Souls stehen im Match in der großen Zahl daneben; nur in der Sandbox steht dort der Itemwert. Die Aussage „Souls 0 gelesen“ war daher falsch.
- **Geprüft an deinen 4 echten HUD-Screenshots** (Sandbox, Build 6701, 1920×1080; Fixtures in `test/fixtures/hud`, nur HUD-Bereiche):
  - alle 15 belegten Slots richtig, keine Fehltreffer auf leeren Slots
  - Hero (Infernus, Mina) eindeutig, keine Fehltreffer in dunklen Flächen
  - Boons „0“ und Itemwerte 10.400 und 29.600 richtig gelesen; die Summe der erkannten Items stimmt mit dem Itemwert überein
  - Sandbox-Zusatz „ITEM VALUE“ in allen Bildern erkannt. Ist er entfernt (so sieht laut Nutzer die Match-Anzeige aus), wird die Zahl als Budget gelesen: 29.600 Souls, „beobachtet“
  - Tab-Spalte: alle 7 bzw. 8 Items richtig
  - auf 720p, 900p, 1440p und 4K hochgerechnet: HUD-Items, Hero und Itemwert überall richtig. Die Tab-Spalte (sehr kleine Icons) liest dabei 6–8 von 8; unsichere Icons zählen als „nicht erkannt“.
  - die ganze App (auch als gepacktes Programm) mit Screenshot als Bildschirmbild: Overlay zeigt Hero, Items und Empfehlung
- **Nicht geprüft**, weil kein Screenshot aus einem echten 6-gegen-6-Match vorlag:
  - Lage und Größe der 12 Porträts oben
  - Tab-Spalten der Gegner
  - welche Seite dein Team ist (angenommen: Porträts auf deiner Bildhälfte)
  - die echte Souls-Anzeige im Match; ob dort ein anderer Zusatztext steht, ist unbekannt. Bisher wurden nur die Ziffern 0, 1, 2, 4, 6 und 9 gesehen.
  - Aufnahme unter Windows (`desktopCapturer`), Rechenlast neben dem Spiel, exklusives Vollbild
- **Schwächen:** Bei mehreren Porträts wird dein Hero erst per Tab-Abgleich erkannt; bis dahin kannst du ihn unter *Verbindung* auswählen. Gegner-Items sind so aktuell wie dein letzter Tab-Druck. Schaden gegen dich wird nicht erkannt.
- **Release:** nur noch ein Installer und eine portable EXE. Die Overwolf-Variante entfällt.


## 0.2.0 (überholt, zur Nachvollziehbarkeit)

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
4. **Bildschirmerkennung im echten Match.** Umgesetzt und an Sandbox-Screenshots geprüft (siehe oben); im 6-gegen-6-Match offen.
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

- `npm test`: **57/57 bestanden**. Das umfasst KV3-Parser, Datensatz-Invarianten, 15 Szenarien, Store-, Provider- (inkl. SSE-Mock), GEP- und Anzeige-Tests sowie 13 Tests zur Bildschirmerkennung an echten Screenshots (inkl. Texterkennung).
- `npm run typecheck`: ohne Fehler.
- **Leistung:** Linux, Xvfb (Software-Rendering), 4 vCPU Xeon 2,8 GHz, Electron 33.4.11, Demo-Modus mit Updates im Sekundentakt. Summe aller App-Prozesse laut `app.getAppMetrics`; CPU in Prozent eines Kerns.

  | Messung | CPU Ø | CPU max | RAM Ø | GPU-Prozess CPU Ø |
  |---|---|---|---|---|
  | nur Overlay (60 s) | 0,6 % | 1,5 % | 447 MB | 0,06 % |
  | Overlay + Einstellungsfenster (45 s) | 2,0 % | 3,7 % | 596 MB | 0,3 % |

  Die Rohdaten stehen in `docs/measurements/`. Ein Einfluss auf die FPS des Spiels wurde **nicht** gemessen, weil kein Spiel lief.
- **Windows-Build:** Der GitHub-Workflow `release-deadlock-item-assistant.yml` lief auf `windows-latest` erfolgreich durch: Typprüfung, alle Tests, NSIS-Installer und portable EXE, Pre-Release `dia-v0.1.0`. Unter Linux ließ sich die portable EXE zusätzlich mit Wine64 bauen.
  Die EXE wurde **nicht** interaktiv unter Windows gestartet; der Workflow baut und testet nur.
