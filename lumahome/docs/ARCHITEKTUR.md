# Architektur und Entscheidungen

## Betriebsform: eigenständige lokale Anwendung

LumaHome läuft **nicht innerhalb** von Home Assistant, sondern als eigenständige
lokale Anwendung aus zwei Teilen:

- **LumaHome-Server** (`server/`, Node.js ≥ 22): liefert die Oberfläche aus,
  hält eine dauerhafte Verbindung zur Home-Assistant-WebSocket-API, speichert
  das Live-Projekt und prüft Berechtigungen.
- **Oberfläche** (`src/`, React + three.js über React Three Fiber, Vite):
  läuft im Browser (Desktop, Wandtablet, Handy).

Begründung: Der Zugriffstoken bleibt auf dem Server; die Oberfläche braucht
keine CORS-Freigaben in Home Assistant; mehrere Geräte im Haushalt teilen
dasselbe Haus. Für die Kernfunktionen sind keine externen oder kostenpflichtigen
Dienste nötig, Schriften und Modelle werden nicht nachgeladen.

## Verbindung und Authentifizierung zu Home Assistant

- WebSocket `HA_URL/api/websocket`, Anmeldung mit langlebigem Zugriffstoken
  (`auth` → `auth_ok`).
- Ablauf: `subscribe_events` (state_changed) **vor** `get_states`, damit keine
  Änderung zwischen beiden verloren geht; danach Entitäts-, Bereichs- und
  Geräteregistry (nur mit Admin-Rechten, sonst ohne Bereichsvorschläge).
- Ping alle 20 s; ohne Antwort binnen 45 s wird die Verbindung neu aufgebaut.
  Wiederverbinden mit 1, 2, 4 … 30 s Abstand, anschließend vollständige
  Neusynchronisierung (neuer Snapshot an alle Browser). Bei ungültigem Token
  wird nur jede Minute erneut versucht.
- Der Browser erhält Zustände per Server-Sent Events (`/api/ha/stream`) und
  ruft Dienste über `/api/ha/service` auf. Der Server lässt nur freigegebene
  Dienste (`light`, `switch`, `cover`, `climate` – siehe
  `src/devices/ha-types.ts`) und bekannte Parameter zu.
- Verlauf: `recorder/list_statistic_ids`, `recorder/statistics_during_period`,
  `history/history_during_period`; Energie-Konfiguration: `energy/get_prefs`.

## Berechtigungen (lokal, nachvollziehbar)

| Konfiguration | Betrachten & Steuern | Bearbeiten (Plan, Einrichtung, Zuordnungen, Messquellen) |
| --- | --- | --- |
| keine PIN | alle, die den Server erreichen | alle |
| nur `LUMAHOME_VIEW_PIN` | mit PIN | mit PIN |
| `LUMAHOME_EDIT_PIN` (+ optional View-PIN) | ohne/mit View-PIN | nur mit Bearbeitungs-PIN |

Sitzungen: HMAC-signiertes, `HttpOnly`/`SameSite=Strict`-Cookie (30 Tage);
Schlüssel in `data/.session-secret`. Ändernde Anfragen benötigen zusätzlich den
Kopf `X-LumaHome: 1`. PIN-Versuche sind auf 5 pro Minute und Adresse begrenzt.
Standard ist `HOST=127.0.0.1` (nur dieser Rechner).

## Datenmodell (`src/model/types.ts`)

Getrennt sind:

1. **Planobjekte**: Etagen, Räume (Polygon mit stabilen Eck-IDs), Öffnungen
   (Tür/Fenster/Durchgang, an einer Raumkante über deren Start-Ecke
   referenziert), Deckenöffnungen, Objekte (Katalogreferenz, Maße, Material, Farbe).
2. **Gerätezuordnungen**: Entität ↔ Objekt/Öffnung/Raum mit Rolle und
   Bestätigungszeitpunkt.
3. **Messpunkte**: Leistungs- und/oder Energiequelle, Bedeutung (Verbrauch,
   Netz, PV, Speicher), Messrichtung, Raum/Objekt, übergeordneter Zähler.
4. **Aktuelle Zustände** – ausschließlich im Live-Store, nie gespeichert oder exportiert.

Projektformat: `{ format: "lumahome-project", formatVersion: 1, exportedAt, project }`.
Importe werden vollständig validiert (Schema, Verweise, Kreisfreiheit der
Zählerhierarchie) und erst nach Bestätigung übernommen; bei Fehlern bleibt das
bisherige Projekt unverändert. Unbekannte Felder werden verworfen.

## Eine Geometrie für 2D und 3D

Wände werden **nicht** gespeichert, sondern aus den Raumpolygonen abgeleitet
(`src/geometry/walls.ts`): Kollineare Kantenabschnitte benachbarter Räume
ergeben genau eine Innenwand, übrige Abschnitte Außenwände; Öffnungen schneiden
die Wandquader. Plan-Editor und 3D-Modell rufen dieselbe Funktion auf – es gibt
keine zweite Hausversion.

Validierung (`src/geometry/validate.ts`): Selbstüberschneidung, zu kleine
Flächen/Wände, überlappende Räume, Öffnungen außerhalb der Wand oder höher als
die Etage, Überschneidung von Öffnungen, Objekte außerhalb/in Wänden/in
Türschwenkbereichen/über Raumhöhe.

### Verhalten beim Verkleinern und Löschen eines Raums

- **Verkleinern/Verschieben von Ecken oder Wänden**: Möbel und Geräte bleiben
  an ihrer Position, Zuordnungen bleiben bestehen. Liegt ein Objekt danach
  außerhalb aller Räume, erscheint ein Hinweis mit der Aktion „In den Raum
  holen“. Öffnungen behalten ihren Abstand zum Wandanfang; passen sie nicht mehr,
  werden sie als Fehler markiert („Auf Wand einpassen“). Nichts wird still verschoben.
- **Löschen**: Ein Dialog listet betroffene Öffnungen, Objekte, Zuordnungen und
  Messpunkte. Der Benutzer wählt „Objekte behalten“ (bleiben auf der Etage,
  markiert) oder „mitlöschen“. Öffnungen und Raum-Zuordnungen des Raums werden
  entfernt, Messpunkte verlieren nur den Raumbezug. Rückgängig ist möglich.

## Gerätezustände

- Funktionen ergeben sich aus den Attributen (`supported_color_modes`,
  `supported_features`, `hvac_modes`, `device_class` …). Ein Kontaktsensor hat
  keine Steuerung.
- **Gesendet vs. bestätigt**: Jeder Befehl wird mit der Kontext-ID aus der
  `call_service`-Antwort verfolgt; erst ein `state_changed` mit dieser ID gilt als
  Bestätigung. Ohne Bestätigung nach 10 s erscheint „keine Rückmeldung“.
- Unbekannt, nicht verfügbar, fehlend und veraltet (Verbindung getrennt bzw.
  Sensor seit > 3 h ohne `last_reported`) werden sichtbar unterschieden.
  Fehlende Werte werden nie als 0 angezeigt.

## Energie

- Leistung (W) und Energie (kWh) werden über getrennte Umrechnungen geführt.
- Gesamtverbrauch: Hauszähler › Berechnung aus Netz, PV und Speicher › nur
  Netzbezug (wenn „keine PV/kein Speicher“ bestätigt ist) › sonst
  „Erfasste Geräte“ mit Hinweis auf Unvollständigkeit.
- Zählerhierarchie: Summen enthalten nur oberste Messpunkte; Unterzähler
  erscheinen im Baum mit „nicht einzeln erfasst“-Rest. Raumwerte gelten nur mit
  „misst den gesamten Raum“ als Raumverbrauch, sonst als erfasste Geräte.
- Verlauf: bevorzugt Langzeitstatistik (`change`, Rücksetzungen behandelt
  Home Assistant), sonst Zustandsverlauf mit eigener Rücksetzungserkennung
  (Rückgang > 10 % = Zählerwechsel). Nur-Leistung wird integriert und als
  „berechnet“ markiert (Statistik-Mittelwerte bzw. Halteverfahren:
  ein Wert gilt bis zur nächsten Änderung, „nicht verfügbar“ beendet den
  Abschnitt). Netto-Flüsse werden für Zeiträume getrennt nach Vorzeichen
  integriert. Lücken bleiben leer und sind schraffiert; ein Verbrauch über eine
  Lücke hinweg wird als Nachholwert gekennzeichnet. Der laufende Zeitraum ist als
  „läuft noch“ markiert.

## Speicherung

- Live: `data/project.json` auf dem Server, atomar geschrieben, mit Revision
  (gleichzeitige Bearbeitung → Konflikt statt stillem Überschreiben) und den
  letzten 20 Ständen in `data/backups/`. Zusätzlich lokaler Entwurf im Browser,
  falls der Server kurz nicht erreichbar ist.
- Demo: nur im Browser (`localStorage`), getrennt vom Live-Projekt.
- Automatisches Speichern ~0,7 s nach der letzten Änderung, sichtbarer Status
  oben links.

## Gehostete Vorschau

Ohne erreichbaren LumaHome-Server (z. B. statisch gehostete Oberfläche) ist nur
der gekennzeichnete Demo-Modus verfügbar.
