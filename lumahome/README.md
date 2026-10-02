# LumaHome

Eigenständige, lokal laufende Anwendung, mit der du dein Zuhause als Grundriss
zeichnest, daraus ein 3D-Modell erhältst, es einrichtest, echte Geräte über
Home Assistant zuordnest und genau dieses Haus anschließend zum Steuern und zum
Verstehen deines Stromverbrauchs nutzt.

Alle Funktionen und alle Katalogmodelle sind frei nutzbar – kein Konto, kein
Shop, keine Abos, keine Lizenzschlüssel.

## Bereiche

| Bereich | Inhalt |
| --- | --- |
| **Zuhause** | 3D-Haus mit Lichtwirkung und Statussymbolen, Steuerkarte am Objekt (Touch: Panel unten), Raumzusammenfassung, „Alle Lichter aus“, Ebenen (Klima, Fenster, Energie, Hinweise, Legende), Wände voll/geschnitten/Grundriss, Etagen, Dach |
| **Gestalten** | Werkzeuge **Grundriss** (Rechteck, Freiform, Außenbereiche ohne Wände wie Terrasse und Garten, Türen, Fenster, Durchgänge, Deckenöffnungen, Maßeingabe, Etagen, Grundrissbild), **Einrichten** (Katalog mit 53 Modellen inkl. Whirlpool, Gartenmöbeln und PV-Modulfeld, Ziehen oder „Platzieren“, Griffe zum Drehen/Skalieren, Einrasten an Wand/Boden/Möbeloberfläche) und **Verbinden** (Geräte zuordnen mit begründeten Vorschlägen). 2D, 3D oder geteilt. Rückgängig/Wiederholen |
| **Wetter & Tageszeit** | Himmel, Licht und Sonnenstand nach `sun.sun` (sonst aus Uhrzeit und Standort geschätzt), Wolken, Regen und Schnee nur außerhalb des Hauses, Nebel, Gewitter; Vorschau für Tageszeit und Wetter |
| **Energie** | Modell „Außen“ mit Dach und leuchtendem PV-Modulfeld oder „Innen“; animierte Stromkabel über den Verteiler zu Geräten, Akkus (mit Ladestand) und Netz. Jetzt: Hausverbrauch mit offengelegter Grundlage, PV/Netz/Speicher, Energiefluss, Räume und Geräte. Verlauf: Tag/Woche/Monat, Energie (kWh) oder Leistung (W), sichtbare Messlücken, höchster Verbrauch, Räume, Zählerhierarchie. Analyse: Autarkie, Eigenverbrauch, Ersparnis und Einspeisevergütung (Schätzung nach eigenem Tarif), CO₂, Herkunft des Stroms je Stunde/Tag, Grundlast, Vergleich mit dem Vorzeitraum. Messquellen: Zuordnung mit Einheiten-/Richtungsprüfung, Ladestand für Akkus, Übernahme aus der HA-Energiekonfiguration |
| **Geräte** | Verbindungsstatus, Moduswechsel Demo/Live, zugeordnete und nicht zugeordnete Geräte, Hinweise, Demo-Testwerkzeuge |

## Als Webseite nutzen (empfohlen)

LumaHome läuft als normale Webseite – ohne Installation und ohne Konsole:
**https://prodbycooooooollin-byte.github.io/Homeassitent/**

1. Seite öffnen (PC, Tablet oder Handy).
2. Adresse deiner Home-Assistant-Instanz eingeben, z. B. `https://xxxx.ui.nabu.casa`.
3. In Home Assistant einen **langlebigen Zugriffstoken** erstellen:
   Profil (unten links auf deinen Namen) → Reiter **Sicherheit** → ganz unten
   **Langlebige Zugriffstoken** → **Token erstellen** → Namen „LumaHome“ →
   Token kopieren (wird nur einmal angezeigt).
4. Token auf der LumaHome-Seite einfügen → **Mit Home Assistant verbinden**.

Der Browser verbindet sich direkt mit Home Assistant, es gibt keinen
Zwischenserver. Der Token bleibt nur in diesem Browser (bei „Angemeldet
bleiben“ dauerhaft, sonst bis zum Schließen des Tabs). Dein Haus wird in den
Benutzerdaten deines Home-Assistant-Kontos gespeichert – jedes Gerät, das sich
mit demselben Konto anmeldet, sieht dasselbe Haus.

**Wichtig – https:** Die Seite läuft über https. Browser erlauben von dort aus
keine unverschlüsselte Verbindung zu `http://homeassistant.local:8123`. Du
brauchst eine **https-Adresse** für Home Assistant, z. B. über Home Assistant
Cloud (Nabu Casa) oder eine eigene Domain mit Zertifikat. Die Anmeldeseite
weist darauf hin, wenn eine http-Adresse eingegeben wird.

**Veröffentlichung (einmalig, für Repository-Besitzer):** GitHub → Repository
→ *Settings* → *Pages* → *Source*: **GitHub Actions**. Danach baut und
veröffentlicht der Workflow `deploy-lumahome-pages.yml` die Seite bei jeder
Änderung auf `main` automatisch.

## Lokal mit eigenem Server (optional)

Voraussetzung: Node.js 22 oder neuer.

```bash
cd lumahome
npm install
npm run build
npm start            # http://127.0.0.1:8787
```

Ohne weitere Konfiguration steht der **Demo-Modus** zur Verfügung
(„Demo-Haus ansehen“). Er ist überall als Demo gekennzeichnet und vom
Live-Projekt technisch getrennt (eigene Datenquelle, eigener Speicher).

Entwicklung mit automatischem Neuladen: `npm run dev` (Oberfläche auf
http://localhost:5173, Server auf Port 8787).

## Mit Home Assistant verbinden

1. In Home Assistant unter *Profil → Sicherheit* einen **langlebigen
   Zugriffstoken** erzeugen (ein Admin-Konto ermöglicht zusätzlich die
   Bereichs-Vorschläge über die Registries; ohne Admin funktioniert alles
   außer diesen Vorschlägen).
2. `cp .env.example .env` und `HA_URL` sowie `HA_TOKEN` eintragen.
3. `npm start` – in der App „Mein Zuhause einrichten“ wählen.

Für ein Wandtablet im Heimnetz `HOST=0.0.0.0` setzen und **PINs vergeben**
(`LUMAHOME_VIEW_PIN`, `LUMAHOME_EDIT_PIN`). Bei selbstsignierten Zertifikaten
der HA-Instanz `NODE_EXTRA_CA_CERTS=/pfad/zum/ca.pem` setzen (oder, nur im
Heimnetz, `HA_INSECURE_TLS=1`).

**Wo liegt der Token?** Ausschließlich in `.env` auf dem Rechner, auf dem der
LumaHome-Server läuft. Er wird nie an den Browser ausgeliefert, nie im Projekt
gespeichert und nie exportiert. Siehe [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).

## Tests

```bash
npm test             # 77 Unit-Tests (Geometrie, Energie, Analyse, Sonnenstand, Wetter, Stromflüsse, Geräte, Projektformat, Kontraste)
npm run test:e2e     # 17 Abnahmetests (Playwright): lokaler Server, Webseiten-Betrieb, Demo, Touch – gegen einen simulierten Home Assistant
npm run perf         # Leistungsmessung mit dem Demo-Projekt (Server muss laufen)
```

Ergebnisse und klare Trennung simuliert/real: [docs/TESTBERICHT.md](docs/TESTBERICHT.md),
Messwerte: [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## Projektstruktur

```
server/            lokaler Server: HA-WebSocket-Verbindung, Berechtigungen, Projektspeicher, Auslieferung
src/model/         Datenmodell, versioniertes Projektformat, Validierung/Migration
src/geometry/      Polygone, Wände (gemeinsam für 2D und 3D), Öffnungen, Platzierung, Fangpunkte, Raum-Operationen
src/catalog/       prozeduraler Möbelkatalog
src/devices/       Fähigkeiten, Zustände (unbekannt/veraltet/nicht verfügbar), Zuordnungsvorschläge
src/energy/        Einheiten, Zählerhierarchie, Zeitreihen (Lücken, Rücksetzungen, Integration), Verlaufsladen
src/sources/       Datenquellen Live (über Server) und Demo (Simulation)
src/store/         Projekt (Rückgängig, Autospeichern), Live-Zustände (gesendet vs. bestätigt), Oberfläche
src/scene/         3D-Darstellung (three.js / React Three Fiber)
src/design/        Grundriss-Editor, Katalog, Eigenschaften, Verbinden
src/home/ energyui/ devicesui/ shell/ ui/   Oberflächen der vier Bereiche und Bausteine
tools/fake-ha/     simulierter Home-Assistant-Server für Tests
e2e/ tests/        Abnahme- und Unit-Tests
```
