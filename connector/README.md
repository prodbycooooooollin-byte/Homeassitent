# Craftboard-Connector-Agent

Ein kleines Node.js-Skript **ohne externe Abhängigkeiten**, das auf demselben
Rechner wie euer Minecraft-Server läuft und Craftboard mit echten Daten
versorgt: Spielerstatistiken, Beitritte/Verlassen, Todesereignisse,
Fortschritte, Kontoverknüpfung per Ingame-Code und (optional per RCON)
Live-Positionen.

Geprüfte Kombination: **Minecraft 1.20.1 mit Fabric**. Die gelesenen
Dateien (`world/stats`, `world/advancements`, `usercache.json`,
`logs/latest.log`) sind Vanilla-Mechanik und daher auch mit anderen
Modloadern/Versionen ähnlich - offiziell getestet ist aber nur diese eine
Kombination.

## Was der Agent tut - und was nicht

- Liest **nur lokal** vorhandene Dateien des Minecraft-Servers.
- Sendet periodisch Zusammenfassungen per HTTPS an eure Craftboard-Instanz,
  authentifiziert mit einem Agent-Key (aus Craftboard → Einstellungen →
  Serververbindung → "Schlüssel erzeugen").
- Verändert **keine** Minecraft-Dateien.
- Braucht **keinen** Zugriff auf Spieler-Zugangsdaten oder Mojang-Konten.
- RCON ist optional: ohne RCON funktionieren Statistiken, Beitritte/
  Verlassen, Tode, Fortschritte und Kontoverknüpfung bereits vollständig.
  Nur Live-Positionen auf der Weltkarte brauchen RCON.

## Einrichtung

1. **Voraussetzungen prüfen**: Node.js ≥ 18 auf dem Server-Rechner
   (`node -v`). Kein `npm install` nötig - der Agent hat keine
   Abhängigkeiten.
2. In Craftboard: Einstellungen → Serververbindung → Schritt "Testen &
   Abschließen" → **Schlüssel erzeugen**. Den angezeigten Schlüssel
   (`cba_...`) sofort kopieren - er wird nur einmal angezeigt.
3. `config.example.json` nach `config.json` kopieren und ausfüllen:
   - `craftboardUrl`: die öffentliche URL eurer Craftboard-Instanz.
   - `agentApiKey`: der eben erzeugte Schlüssel.
   - `serverDir`: absoluter Pfad zum Minecraft-Server-Ordner (der Ordner,
     der `server.properties`, `logs/` und `world/` enthält).
   - `rcon` (optional): `enabled: true` setzen und Host/Port/Passwort aus
     `server.properties` eintragen (`enable-rcon=true`, `rcon.port`,
     `rcon.password`), um Live-Positionen zu aktivieren.
4. Agent starten: `node src/index.js` (im `connector/`-Ordner). Für den
   Dauerbetrieb empfiehlt sich ein Prozess-Manager, siehe unten.
5. In Craftboard sollte unter Einstellungen kurz danach "Vollständig
   verbunden" erscheinen.

## Kontoverknüpfung (Ingame-Code)

Ein Nutzer erzeugt in Craftboard (Einstellungen → Minecraft-Account
verknüpfen) einen Code und schreibt **`!link CODE`** in den Server-Chat.
Der Agent erkennt das über das Log, bestätigt den Code bei Craftboard und
sendet (mit RCON) eine Bestätigung per `tellraw` zurück an den Spieler.
Ohne RCON funktioniert die Verknüpfung trotzdem - nur die Ingame-Bestätigung
entfällt, das Ergebnis ist aber sofort in Craftboard sichtbar.

## Dauerbetrieb einrichten

**systemd (Linux)** - Beispiel `/etc/systemd/system/craftboard-agent.service`:

```ini
[Unit]
Description=Craftboard Connector Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=/pfad/zu/connector
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Dann: `systemctl enable --now craftboard-agent`.

**Alternativ** (einfacher, aber ohne Auto-Neustart bei Absturz): den Agent
im selben Startskript/derselben `screen`/`tmux`-Sitzung wie den Minecraft-
Server starten.

## Bekannte Einschränkungen

- **Todesnachrichten**: Vanilla hat keine einzelne feste Log-Vorlage für
  alle ~100 Todesarten. Der Agent erkennt sie heuristisch (Zeile beginnt
  mit einem bekannten Online-Spielernamen, ist keine Chat-/Beitritts-/
  Verlassen-Zeile) - in seltenen Fällen kann das eine ungewöhnliche
  Server-Log-Zeile fälschlich als Tod werten oder eine sehr untypisch
  formulierte Todesmeldung verpassen.
- **Restart mitten in einer Sitzung**: Ein neu gestarteter Agent kennt
  Spieler, die schon vor seinem Start online waren, erst nach deren
  nächstem Beitritt als "online" (bis dahin liefert der nächste
  Statistik-Zyklus trotzdem die korrekten kumulierten Werte).
- **Live-Positionen**: Nur mit aktivem RCON, und nur für gerade online
  gemeldete Spieler. Keine feingranulare Sichtbarkeits-Berechtigung pro
  Spieler (siehe Haupt-README der Webapp).
- **TPS/Tickzeit/Speicher**: Vanilla-RCON liefert das nicht. Der
  Admin-Bereich "Serverzustand" zeigt deshalb "Nicht verfügbar", bis ein
  zusätzlicher Performance-Mod/Plugin diese Werte künftig bereitstellt.

## Eigene Tests ohne echten Minecraft-Server

`src/` besteht aus kleinen, einzeln testbaren Modulen (keine Server-
Bindung nötig für Logikfehler):

```bash
node -e "import('./src/uuid.js').then(m => console.log(m.offlineUuidFor('Notch')))"
node -e "import('./src/logParser.js').then(m => console.log(m.parseLogLine('[12:00:00] [Server thread/INFO]: Notch joined the game', new Set())))"
```
