# Craftboard

Der gemeinsame Treffpunkt für eine Freundesgruppe auf einem modifizierten
Minecraft-Java-Server: Serverstatistiken, Spielervergleiche, eine
gemeinsam nutzbare Weltkarte mit Live-Zeichenfunktion und die zentrale
Modpack-Downloadseite - dunkles Design, dezente grüne Akzente, echte
Backend-Anbindung.

Diese App ist **kein Mockup**: Accounts, Serververbindung, Statistik-
Snapshots, Projekte, Kartenzeichnungen und Modpack-Versionen liegen in
einer echten Datenbank. Wo echte Serverdaten fehlen (kein Server
eingerichtet, keine Verbindung, kein Connector), zeigt die App das ehrlich
an - **nie** erfundene Werte.

## Geprüfte Server-Kombination

**Minecraft 1.20.1 mit Fabric.** Das ist bewusst die einzige Kombination,
für die der Connector-Agent geprüft ist - siehe `lib/constants.ts`
(`SUPPORTED_SERVER_TARGETS`). Die Basis-Statusabfrage (Server List Ping)
funktioniert unabhängig davon gegen praktisch jeden Java-Server ab Version
1.7; für vollständige Statistiken/Spielerlisten/Live-Positionen ist die
geprüfte Kombination + der Connector nötig.

## Zwei Verbindungsstufen

| Stufe | Woher | Liefert |
|---|---|---|
| **Basis** | Server List Ping (Adresse+Port, kein Connector nötig) | Online/Offline, Spielerzahl, MOTD, Version |
| **Vollständig** | Connector-Agent (`connector/`, läuft auf dem Server-Rechner) | Spielernamen, Statistiken, Live-Positionen, Kontoverknüpfung, Todes-/Fortschrittsereignisse |

Die Einstellungsseite zeigt jederzeit, welche Stufe gerade aktiv ist.

## Architektur

```
app/                    Next.js 15 App Router (Seiten + API-Routen)
  (app)/                Authentifizierter Bereich mit der Sidebar-Navigation
  api/ingest/*           Endpunkte für den Connector-Agent (Agent-Key-Auth)
  api/map/*               Marker/Zeichnungen/Live-Positionen + SSE-Stream
  api/modpack/download    Download-Route für hochgeladene .mrpack-Dateien
components/              UI-Komponenten, nach Bereich sortiert
lib/
  actions/                Server Actions (Formulare, Mutationen)
  queries/                Echte Datenbank-Abfragen je Bereich
  demo/                   Beispieldaten NUR für den Demo-Modus (siehe unten)
  minecraft/              Server List Ping + RCON (selbst implementiert)
  ingest/                 Validierung + Verarbeitung der Agent-Meldungen
  stats/                  Rangliste-/Serverziel-Berechnung (echte Deltas)
  auth/                   Sessions, Passwort-Hashing, Rechteprüfung
  crypto/                 AES-256-GCM für das gespeicherte RCON-Passwort
  realtime/               Prozessweiter Event-Bus für die Weltkarte (SSE)
prisma/schema.prisma     Vollständiges Datenmodell (siehe unten)
connector/               Eigenständiger Node.js-Agent (siehe connector/README.md)
scripts/smoke-test.mjs   End-to-End-Verifikation der wichtigsten Abläufe
```

**Warum Server-Sent Events statt WebSockets?** Für eine kleine, selbst
gehostete Freundesgruppen-Instanz (ein Node-Prozess) reicht ein simpler,
serverseitig gehaltener Event-Bus mit SSE für die Live-Aktualisierung der
Weltkarte - keine zusätzliche Infrastruktur (Redis o. Ä.) nötig. Das setzt
ein **dauerhaft laufendes Node-Deployment** voraus (`next start`), kein
rein serverloses Hosting.

## Voraussetzungen

- Node.js ≥ 18.18 (empfohlen: 20 LTS oder neuer)
- npm (liegt Node bei)
- Für die vollständige Anbindung: Zugriff auf den Minecraft-Server-Rechner,
  um dort zusätzlich den Connector-Agent laufen zu lassen (siehe
  `connector/README.md`)

## Installation & erster Start

```bash
npm install
cp .env.example .env          # Werte prüfen/anpassen, siehe unten
npm run db:migrate            # legt prisma/dev.db an und wendet alle Migrationen an
npm run dev                   # http://localhost:3000
```

Das **erste registrierte Konto wird automatisch Admin** - danach unter
Einstellungen → Mitglieder weitere Rollen vergeben. Bis ein Admin die
Serververbindung abgeschlossen hat, läuft die App automatisch im
**Demo-Modus** (deutlich gekennzeichnete Beispieldaten).

### Produktion

```bash
npm run build
npm run start                 # dauerhafter Node-Prozess, siehe Hinweis oben zu SSE
```

Empfohlen hinter einem Reverse Proxy (nginx/Caddy) mit HTTPS - die
Session-Cookies sind `secure` in Produktion (`NODE_ENV=production`) und
werden ohne HTTPS vom Browser verworfen.

## Umgebungsvariablen (`.env`)

| Variable | Zweck | Standard |
|---|---|---|
| `DATABASE_URL` | SQLite-Datei (relativ zu `prisma/`) | `file:./dev.db` |
| `STORAGE_DIR` | Ablageort für Uploads (.mrpack, Bilder) | `./storage` |
| `CREDENTIALS_ENCRYPTION_KEY` | 32-Byte-Hex-Schlüssel für das verschlüsselt gespeicherte RCON-Passwort | wird beim ersten Start automatisch erzeugt und unter `storage/credentials.key` abgelegt |
| `MODRINTH_API_BASE` | Modrinth-API überschreiben (Tests) | `https://api.modrinth.com/v2` |

`CREDENTIALS_ENCRYPTION_KEY` für Produktion **explizit setzen und sichern**
(z. B. `openssl rand -hex 32`) - ohne festen Schlüssel macht ein Neustart
ohne die auto-generierte Datei gespeicherte RCON-Passwörter ungültig
(Admin müsste sie neu eingeben; alle anderen Daten bleiben unberührt).

## Datenbank

Standardmäßig **SQLite** (Datei `prisma/dev.db`) - für eine
Freundesgruppen-Instanz ausreichend und ohne separate Datenbank-
Installation nutzbar. Für Postgres in Produktion: in
`prisma/schema.prisma` `provider = "sqlite"` auf `"postgresql"` ändern,
`DATABASE_URL` entsprechend setzen und `npx prisma migrate deploy`
ausführen (Prisma unterstützt SQLite nicht nativ mit `enum`-Typen - das
Schema modelliert "Enums" deshalb bewusst als Strings mit Wertelisten in
`lib/constants.ts`, das bleibt auf beiden Datenbanken gültig).

## Minecraft-Server verbinden

1. Als Admin anmelden → **Einstellungen** → Einrichtungsassistent.
2. **Schritt 1**: Servername, Adresse, Port, optional Gründungsdatum
   (für das Serveralter auf der Übersicht).
3. **Schritt 2**: Version + Plattform wählen (aktuell: 1.20.1 + Fabric).
4. **Schritt 3**: Erklärung, was der Connector-Agent tut, plus optionale
   RCON-Zugangsdaten (aus `server.properties`) und optionale
   Kartenkacheln-URL für die Weltkarte.
5. **Schritt 4**: Verbindung testen (Server List Ping, optional RCON),
   speichern, Agent-Schlüssel erzeugen (nur einmal sichtbar!), Einrichtung
   abschließen.
6. Agent auf dem Server-Rechner einrichten: siehe `connector/README.md`.

Ohne Zugriff auf den echten Minecraft-Server bleibt die App vollständig
lauffähig (Demo-Modus, alle Formulare/Prüfungen funktionieren); die
Ingest-API und der Connector sind vollständig implementiert und gegen
synthetische Fixtures sowie einen Mock-Server verifiziert (siehe
`connector/README.md`, Abschnitt "Eigene Tests"), aber nicht gegen einen
laufenden echten Minecraft-Server getestet - das kann aus dieser Sandbox
heraus nicht geprüft werden (kein ausgehender roher TCP-Zugriff auf
beliebige Ports). Nach der Einrichtung zeigt "Verbindung testen" sofort,
ob es beim echten Server funktioniert.

## Rollen & Berechtigungen

- **Admin**: alles, inkl. Serververbindung, Modpack-Freigabe,
  Mitgliederverwaltung, Demo-Modus-Schalter, fremde Inhalte verwalten.
- **Mitglied**: eigene Marker/Zeichnungen/Projekte/Ziele/Meilensteine
  anlegen und verwalten, Minecraft-Account verknüpfen.
- **Besucher**: nur lesend, kein eigener Inhalt.

Jede Berechtigung wird **serverseitig** in den Server Actions/Route
Handlern geprüft (`lib/auth/permissions.ts`) - UI-Ausblendungen sind nur
Komfort, nie die einzige Schranke.

## Funktionsüberblick nach Phase

**Phase 1** - Übersicht, Accounts, Modpack: Server-Status (mit
"zuletzt bekannt"-Kennzeichnung bei Verbindungsausfall), Online-Spieler,
Serveralter/Laufzeit/Gesamtspielzeit/Blöcke/Mobs/Tode, 7/30-Tage-
Aktivität, Adresse kopieren; Modpack-Upload (.mrpack) oder
Modrinth-Verknüpfung mit echter Modliste aus dem Paketinhalt.

**Phase 2** - Spieler & Statistiken: Profile mit Aufschlüsselung nach
Blockart/Mobart/Strecke/Fortschritt, persönlicher (privater)
Todesmarker, Ranglisten Gesamt/Woche/Monat (echte Deltas, keine
rückwirkend erfundene Historie).

**Phase 3** - Weltkarte: Dimensionswechsel, Marker mit Kategorie/
Sichtbarkeit, **echte gemeinsame Zeichenebene** (Freihand/Strecke/Fläche/
Text, pro Nutzer eigene Farbe, live per SSE synchronisiert, dauerhaft
gespeichert), Ebenen-Filter, Live-Spielerpositionen mit Verfolgen-Modus
(nur mit RCON), Portalverzeichnis mit berechneten (klar so markierten)
Zielkoordinaten.

**Phase 4** - Zusätzliches: Bauprojekte mit Aufgaben/Materialliste,
Serverziele mit live berechnetem Fortschritt, Serverchronik (automatisch
+ manuelle Meilensteine), Wochenrückblick, Serverzustand für Admins
(TPS/Tickzeit/Speicher - zeigt "Nicht verfügbar", da Vanilla-RCON das
nicht liefert; siehe `connector/README.md`).

## Demo-Modus

Aktiv, solange kein Server eingerichtet ist, danach per Schalter in den
Einstellungen umschaltbar (z. B. zum Vorführen der Oberfläche). Jede
Seite mit Beispieldaten zeigt oben ein deutliches Banner. Demo- und
Echtdaten-Pfade sind im Code strikt getrennt (`lib/demo/*` vs.
`lib/queries/*`) - Beispieldaten können echte Daten nie überschreiben oder
sich mit ihnen vermischen.

## Geprüfte Abläufe

`npm run smoke-test` (gegen eine laufende `npm run dev`-Instanz, am besten
mit frischer Datenbank) prüft automatisiert:

- Registrierung (erstes Konto → Admin), Logout, Login mit falschem
  Passwort (Fehlermeldung, kein Zugriff), Login mit korrektem Passwort.
- Kompletter Einrichtungsassistent inkl. Verbindungstest gegen einen
  eingebetteten protokoll-korrekten Fake-Minecraft-Server, Agent-Schlüssel-
  Erzeugung, Abschluss (Demo-Modus schaltet sich automatisch ab).
- Rechteprüfung: ein Mitglied sieht keine Admin-Bereiche.

`npm run smoke-test:map` (braucht eine Instanz mit bereits eingerichtetem
Server, z. B. nach `npm run smoke-test`) prüft die Weltkarte mit zwei
parallelen Browser-Sitzungen: Marker/Zeichnung erscheinen bei einem
zweiten Nutzer ohne Reload (SSE), überstehen einen harten Reload (echte
Persistenz), und ein Nicht-Besitzer sieht keinen Löschen-Button bei
fremden Einträgen.

Zusätzlich manuell verifiziert (siehe Commit-Historie für Details):
Connector-Agent End-to-End gegen einen Mock-HTTP-Server (Start-/Stop-
Event, korrekt geparster Snapshot, Log-basiertes Join-Event mit
berechneter Offline-UUID); RCON-Client (Einzel- und Mehrbefehlssitzung)
gegen protokoll-korrekte Mock-Server; Statistik-/Log-Parsing-Module des
Connectors gegen synthetische Minecraft-Dateien.

## Bekannte Einschränkungen / Folgearbeiten

- **Live-Spielerpositionen** haben noch keine feingranulare Pro-Spieler-
  Sichtbarkeits-ACL (z. B. Spectator-/Vanish-Erkennung) - aktuell sehen
  alle angemeldeten Mitglieder die Positionen aller online gemeldeten
  Spieler. Für eine kleine, vertraute Freundesgruppe ist das eine bewusste
  Vereinfachung, für größere/offenere Server müsste das nachgerüstet
  werden.
- **TPS/Tickzeit/Speicher** liefert Vanilla-RCON nicht - der
  Admin-Bereich zeigt ehrlich "Nicht verfügbar", bis ein zusätzlicher
  Performance-Mod/-Plugin diese Werte an den Connector liefert.
- **Todeserkennung** im Connector ist heuristisch (siehe
  `connector/README.md`), da Vanilla keine einzelne feste
  Todes-Log-Vorlage hat.
- **Kartenkacheln**: Es wird bewusst keine feste Integration eines
  bestimmten Kartenrenderers (z. B. BlueMap) vorgetäuscht, da dessen
  3D-Ansicht kein einfaches {z}/{x}/{y}-Kachelraster liefert. Die
  Weltkarte akzeptiert stattdessen eine beliebige Kachel-URL-Vorlage
  (funktioniert z. B. mit einem selbst gehosteten Dynmap-"flat"-Export);
  ohne Angabe zeigt sie ein neutrales Koordinatenraster statt erfundener
  Kacheln. Die Marker-/Zeichenfunktion ist davon unabhängig und
  funktioniert auch ganz ohne Kartenkacheln vollständig.
- **`npm audit`**: Next.js ist bewusst auf der gepflegten
  15.x-Backport-Linie (15.5.25) statt auf 16 gepinnt, um in diesem Projekt
  auf einer mir sehr sicher bekannten API-Oberfläche zu bleiben; ein
  einzelner verbleibender PostCSS-Hinweis (in Next.js' eigenem Vendor-Code)
  wird erst mit Next 16 vollständig behoben. `mysql2`/`prisma`-Hinweise
  betreffen einen in dieser App nicht genutzten Datenbanktreiber (nur
  SQLite ist konfiguriert).
- Kein automatisierter Test-Runner (Jest/Vitest) eingerichtet - Tests
  laufen aktuell als eigenständige Skripte (`npm run smoke-test` sowie die
  in `connector/README.md` gezeigten Modul-Checks).

## Tech-Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Prisma/SQLite ·
React 19 · Leaflet/react-leaflet · Recharts · bcryptjs (Passwort-Hashing,
eigenes Session-System) · Zod (Validierung) · adm-zip (.mrpack-Analyse) ·
Playwright (Smoke-Test)
