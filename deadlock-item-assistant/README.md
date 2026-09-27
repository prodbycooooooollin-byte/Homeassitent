# Deadlock Item-Assistent

Windows-Desktop-App mit einem kleinen Ingame-Overlay für **Deadlock**. Die App empfiehlt, welches Item du als Nächstes kaufen solltest, und begründet das. Grundlage sind dein Hero, dein aktueller Build, dein Budget und die gegnerischen Heroes und Items.

- **Jetzt kaufen / darauf sparen**, mit Preis nach Komponentenrabatt, fehlendem Betrag und einer ausdrücklichen Abwägung.
- **Kurze Begründung** je Empfehlung, abgeleitet aus denselben Faktoren wie die Auswahl.
- **Dezente Hinweise** bei entscheidenden gegnerischen Käufen: gebündelt, ohne Duplikate, ohne Ton und ohne Fokuswechsel.
- **Austauschvorschlag** bei vollem Inventar: Netto-Kosten, Gewinn und Verlust. Das Item geht nie reflexhaft an das billigste.

## Vollautomatisch

Einmal einrichten, danach wird **jedes Match automatisch verfolgt**. Das umfasst deinen Hero, deine Souls (dein Budget), deine Items, die Heroes und Builds aller Gegner und den Schaden gegen dich. Pro Match gibst du nichts ein.

| Schritt | Was passiert |
|---|---|
| Steam-Konto | wird automatisch aus deiner lokalen Steam-Anmeldung (`loginusers.vdf`) erkannt, ohne Login und ohne Passwort |
| Spielstart | Deadlock wird automatisch erkannt |
| Live-Daten | **Overwolf-Spielevents** über die mitgelieferte Overwolf-Laufzeit (ow-electron), ohne Overwolf-Client |
| Match | Die Match-ID kommt aus den Spielevents; bei jedem neuen Match setzt die App alles zurück |
| Budget | kommt direkt aus den Spielevents. Die Bedeutung von „souls“ wird beim ersten eigenen Kauf gemessen; bis dahin wird das Budget berechnet und so gekennzeichnet |

**Einmalige Einrichtung:** Overwolf gibt die Spielevents im *Entwicklermodus* für deinen eigenen Rechner frei. Dafür brauchst du einen eigenen, kostenlosen Entwicklerzugang auf [console.overwolf.com](https://console.overwolf.com):

1. Unter *Profile → API Keys* einen Schlüssel oder Dev-Token erzeugen.
2. In der App unter **Verbindung → Live-Spielevents einrichten** einfügen.
3. Speichern. Die App startet einmal neu.

Die App legt kein Konto für dich an und akzeptiert keine Bedingungen für dich.

**Ohne Schlüssel** läuft die Automatik trotzdem, über den Zuschauer-Stream als Fallback:

- Das Steam-Konto wird automatisch erkannt, das laufende Match über die Community-API gesucht.
- Diese Suche findet nur die ca. 200 meistgesehenen Matches.
- Die Daten sind verzögert, und das Budget wird aus Gesamt-Souls minus Itemwert berechnet.
- Voraussetzung ist der quelloffene Live-Events-Dienst lokal per Docker: `docker run -p 3000:3000 ghcr.io/deadlock-api/deadlock-live-events:latest`.

> **Ehrlicher Stand:** siehe [`docs/STATUS.md`](docs/STATUS.md). Die Overwolf-Anbindung ist gegen das dokumentierte Event-Schema gebaut und mit simulierten Events getestet. **Mit echtem Spiel und echter Overwolf-Laufzeit ist sie noch nicht geprüft**, weil die Entwicklungsumgebung Linux ohne Zugang zu Overwolf war.

| Kompakt | Hinweis bei Gegnerkauf | Austausch bei vollem Inventar | Details (Strg+Umschalt+D) |
|---|---|---|---|
| ![kompakt](docs/screenshots/overlay-compact.png) | ![Hinweis](docs/screenshots/overlay-alert.png) | ![Austausch](docs/screenshots/overlay-swap.png) | ![Details](docs/screenshots/overlay-expanded-warden.png) |

Das Design folgt Deadlocks eigener Farbwelt (Werte aus den Panorama-Styles des Spiels):

- fast schwarze, grünlich getönte Flächen
- Elfenbeintext `#FFEFD7`
- Gold `#FFED79` für die Empfehlung
- Mintgrün `#70F8C1` für Souls
- Feindrot `#FF410D` für Hinweise
- Shop-Kategoriefarben: Waffe orange, Vitalität grün, Spirit violett

Die Screenshots zeigen die echte Oberfläche im Demo-Modus, aufgenommen unter Linux/Xvfb. Zur Einrichtung siehe [`docs/screenshots/control-connect.png`](docs/screenshots/control-connect.png).

## Voraussetzungen

- **Nutzung:** Windows 10/11 (x64); Deadlock im **randlosen Fenstermodus**. Exklusiver Vollbildmodus ist nicht verifiziert.
- **Für die volle Automatik:** der eigene Overwolf-Entwicklerschlüssel (siehe oben) und die Variante **„Auto“**.
- **Falls Deadlock als Administrator läuft:** die App ebenfalls als Administrator starten.
- **Entwicklung:** Node.js 22 und npm.

## Installation / Start

**Fertige Version:** Unter *Releases* (Tag `dia-v<version>`):

- `Deadlock-Item-Assistent-Auto-Setup-*.exe` (**empfohlen**, mit Overwolf-Laufzeit)
- `Deadlock-Item-Assistent-Standard-*` (ohne Overwolf, nur Zuschauer-Stream-Fallback)

Nicht signiert, deshalb kann SmartScreen warnen.

**Falls der Entwicklermodus in der installierten Version nicht greift:** `npm ci`, dann `npm i -D @overwolf/ow-electron`, dann `npm run start:ow` mit gesetztem `OW_DEV_KEY`. So wird die App direkt aus dem Quellcode mit der Overwolf-Laufzeit gestartet.

**Aus dem Quellcode:**

```bash
cd deadlock-item-assistant
npm ci
npm start            # baut und startet (Quelle aus den Einstellungen)
npm run start:demo   # startet mit Demo-Daten
npm test             # 44 Tests
npm run typecheck
npm run demo         # Terminal-Demo ohne Oberfläche
npm run dist:win     # Windows-Installer und portable EXE (unter Windows; unter Linux siehe unten)
```

**Spieldaten aktualisieren** (nach einem Patch): in der App unter *Spieldaten → Spieldaten aktualisieren*, oder per Kommandozeile:

```bash
npm run gamedata:fetch && npm run gamedata:extract
```

**Daten-Prototyp** gegen ein echtes Match:

```bash
npm run probe -- --base http://localhost:3000 --match <ID> --account <SteamID3> --minutes 10
```

## Bedienung

| Hotkey (änderbar) | Wirkung |
|---|---|
| `Strg+Umschalt+D` | Details öffnen/schließen: Gründe, Gegner, Bedarf, Alternativen, letzte Hinweise |
| `Strg+Umschalt+E` | Bearbeitungsmodus: verschieben, Größe, Deckkraft; derselbe Hotkey oder „Fertig“ beendet ihn |
| `Strg+Umschalt+O` | Overlay ein-/ausblenden |
| `Strg+Umschalt+K` | Einstellungsfenster |

Im normalen Modus reicht das Overlay alle Mausaktionen an das Spiel durch und nimmt keinen Fokus. Die Position wird relativ zum Monitor gespeichert, damit sie DPI- und Auflösungswechsel übersteht.

## Architektur und Stack

**Stack: Electron + TypeScript.** Die Gründe:

- **Datenzugang:** HTTP/SSE im Hauptprozess.
- **Overlay:** transparentes, klickdurchlässiges Fenster über `setIgnoreMouseEvents(…, {forward:true})`, ohne Injektion.
- **Hotkeys:** globale Hotkeys.
- **Pflege:** Eine Codebasis für Logik, Tests und UI. Das Muster ist identisch zum `lol-build-assistant` in diesem Repository.
- **Kein zusätzlicher Client:** kein Overwolf, keine Pflicht-Monetarisierung.

```
src/gamedata   KV3-Parser, Extraktion aus Spieldateien, Katalog, Effekte, Hero-Signale, Namensabgleich
src/providers  demo | manual | spectator (SSE) – liefern nur normalisierte Snapshots
src/state      MatchStore: Match-Reset, Rücksprungschutz, Basislinie, bestätigtes Entfernen, Upgrades
src/engine     Bedrohung, Bedarf, gemeinsamer Nutzen, Kaufen/Sparen, Austausch, Stabilisierung, Hinweise, Texte
src/present    ViewModel (nur Aufbereitung)
src/main       Electron-Hauptprozess, Controller, Einstellungen
src/renderer   Overlay, Einstellungs-/Diagnosefenster
data/gamedata  extrahierte Spieldaten (Build 6701)   data/knowledge  kuratierte, build-gebundene Einschätzungen
```

Details zur Logik stehen in [`docs/ENGINE.md`](docs/ENGINE.md).

## Grenzen

- Die App liest keinen Speicher, injiziert nichts und sendet keine Eingaben ans Spiel. Lokal liest sie nur die Versionsdatei `steam.inf`.
- Das ist **keine** Freigabe durch Valve und keine Garantie gegen Sanktionen.
- Kaufe und verkaufe immer selbst; die App berät nur.
- Modellwerte sind keine Siegchancen.
