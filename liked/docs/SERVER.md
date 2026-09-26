# Server-Anleitung

Der LIKED-Server verwaltet Räume, den verbindlichen Spielzustand, Stimmen und Wertung. Optional stellt er den
getrennten Auth-Dienst für den offiziellen TikTok-Import bereit. Videos laufen **nicht** über den Server.

## Voraussetzungen

- Node.js ≥ 22 **oder** Docker.
- Für Spiele über das Internet: öffentlich erreichbarer Host mit **HTTPS/WSS** (z. B. Caddy mit Let's Encrypt,
  siehe `deploy/`) und eine Domain.
- Dauerhafte WebSocket-Verbindungen müssen erlaubt sein. Viele „Serverless“-Angebote erfüllen das nicht, und
  Gratis-Tarife legen inaktive Instanzen oft schlafen. Die tatsächlichen Limits des Anbieters prüfen.
- Optional (offizieller TikTok-Import): freigegebene TikTok-App, `TOKEN_ENCRYPTION_KEY` und ein persistentes
  Volume für `DATA_DIR`.

## Starten

```bash
cd liked
npm ci
npm run build -w @liked/server
cp apps/server/.env.example apps/server/.env   # Werte anpassen, nicht committen
cd apps/server && set -a && . ./.env && set +a && node dist/index.js
```

Oder mit Docker und automatischem HTTPS:

```bash
cd liked
cp apps/server/.env.example apps/server/.env   # PUBLIC_URL, TRUST_PROXY=1, ggf. TikTok-Werte
# deploy/Caddyfile: Domain eintragen
docker compose -f deploy/docker-compose.yml up -d --build
```

### Render (empfohlen für den Start: ein zentraler Server für alle)

Im Repository liegt ein Blueprint (`render.yaml` im Repo-Root): Node 22, Region Frankfurt, Gratis-Tarif,
Healthcheck `/healthz`, `TRUST_PROXY=1`. Render stellt HTTPS/WSS automatisch bereit, und `PUBLIC_URL` wird aus
`RENDER_EXTERNAL_URL` übernommen.

1. Auf [render.com](https://render.com) anmelden und GitHub verbinden (Zugriff auf dieses Repository erlauben).
2. **New → Blueprint** → Repository `Homeassitent` wählen → Branch wählen (nach dem Merge `main`) → **Apply**.
3. Der Dienst heißt `liked-partyspiel-server`. Dadurch lautet die Adresse
   **`https://liked-partyspiel-server.onrender.com`**, und genau diese Adresse ist fest in der App eingebaut
   (`apps/desktop/scripts/build-main.mjs`). Spieler müssen nichts eintragen.
   Prüfen: `https://liked-partyspiel-server.onrender.com/healthz` liefert `{"ok":true,…}`.
4. **Wichtig:** Zeigt Render nach dem Anlegen eine andere Adresse an (z. B. mit angehängtem Zufallskürzel, weil der
   Name vergeben war), die Konstante `DEFAULT_SERVER_URL` in `build-main.mjs` anpassen oder in GitHub die
   Actions-Variable `LIKED_SERVER_URL` setzen. Danach baut die CI einen neuen Installer.

Die App verwendet immer den Standard-Server des installierten Builds. Nur wer unter *Einstellungen → Server* bewusst
eine andere Adresse einträgt (z. B. den lokalen Hostmodus), weicht davon ab; „Standard-Server verwenden“ stellt
das zurück. Ältere Installationen mit gespeicherter Adresse `localhost` werden beim Start automatisch umgestellt.

**Grenzen des Gratis-Tarifs** (laut [Render-Doku](https://render.com/docs/free)):
- Nach 15 Minuten ohne eingehenden Verkehr schläft der Dienst ein, das Aufwachen dauert etwa eine Minute. Die App
  weckt ihn beim Verbinden automatisch und zeigt „Server wird gestartet …“. Laufende Partien halten ihn wach,
  weil die Clients regelmäßig WebSocket-Nachrichten senden.
- Das Dateisystem ist flüchtig. Räume liegen ohnehin nur im Speicher. Für den **offiziellen TikTok-Import** ist
  aber ein dauerhafter Token-Speicher sinnvoll: dann einen bezahlten Tarif mit *Persistent Disk* wählen (z. B.
  Mount `/data`, `DATA_DIR=/data`). Sonst müssen Spieler TikTok nach jedem Neustart neu verbinden.
- Die TikTok-Variablen `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` und `TOKEN_ENCRYPTION_KEY` werden erst nach der
  TikTok-Freigabe im Dashboard unter *Environment* eingetragen. Als Redirect-URL bei TikTok
  `https://…onrender.com/auth/tiktok/callback` hinterlegen.

Healthcheck: `GET /healthz` liefert `{ ok, version, protocol, uptimeSec, rooms, tiktokOfficialAdapter }`.
Beitrittslink: `https://<domain>/join/<CODE>` öffnet eine Seite mit dem Code und einem `liked://join/<CODE>`-Link.

In der Desktop-App trägt jeder Spieler unter *Einstellungen → Server* die Adresse ein (z. B.
`https://liked.example.org`). Für Release-Builds kann die Standardadresse über die GitHub-Variable
`LIKED_SERVER_URL` festgelegt werden (kein Secret).

## Konfiguration (Umgebungsvariablen)

| Variable | Bedeutung | Standard |
|---|---|---|
| `PORT`, `HOST` | Listen-Adresse | `8787`, `0.0.0.0` |
| `PUBLIC_URL` | öffentliche Basis-URL | `http://localhost:PORT` |
| `TRUST_PROXY` | `1` = Client-IP aus `X-Forwarded-For` (nur hinter eigenem Proxy!) | aus |
| `MAX_ROOMS` | Obergrenze gleichzeitiger Räume | `200` |
| `DATA_DIR` | verschlüsselter Auth-Speicher | `./data` |
| `LOG_LEVEL` | `debug/info/warn/error` | `info` |
| `RECONNECT_WINDOW_MS` | Wiederverbindungsfenster | `30000` |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | aktiviert den offiziellen Adapter | – |
| `TIKTOK_REDIRECT_URI` | muss exakt in der TikTok-App eingetragen sein | `PUBLIC_URL/auth/tiktok/callback` |
| `TIKTOK_SCOPES` | angefragte Scopes | `user.info.basic,portability.activity.ongoing` |
| `TOKEN_ENCRYPTION_KEY` | 32 Byte base64, Pflicht mit TikTok | – |
| `TIMINGS_SCALE` | **nur Test/Entwicklung**: verkürzt Auflösung/Zwischenstand | `1` |

Secrets gehören in die Umgebung bzw. in einen Secret-Speicher, niemals ins Repository oder in den Desktop-Build.

## Datenhaltung und Aufräumen

- **Räume** liegen nur im Arbeitsspeicher. Entfernt werden sie, wenn niemand mehr verbunden ist (Reconnect-Fenster
  + 5 s), 30 min nach dem Ergebnis oder nach 30 min Inaktivität. Ein Prozessneustart löscht alle Räume vollständig.
  Clip-Kandidaten werden beim Partiestart aus dem Raum entfernt; Zuordnungen existieren nur, solange der Raum lebt.
- **Auth-Speicher** (nur mit TikTok): verschlüsselt. Like-IDs werden nach der Abholung gelöscht, spätestens nach 24 h.
  Datensätze ohne Nutzung verfallen nach 90 Tagen, abgelaufene Refresh-Tokens sofort. Das Aufräumen läuft beim
  Start und alle 10 min. **Backups/Snapshots** dieses Volumes mit ebenso kurzer Aufbewahrung konfigurieren oder
  ganz ausschließen.
- **Logs** enthalten nur Ereignisnamen, anonymisierte Raum-Kürzel und Zahlen: keine Namen, Tokens, Clip-IDs oder
  Zuordnungen (per Test abgesichert). Die Caddy-Zugriffslogs sind im Beispiel deaktiviert.

## Kapazität (gemessen, nicht hochgerechnet)

Messung vom 26.09.2026 in der Build-Umgebung (4 vCPU, Linux, Node 22) mit `npx tsx apps/server/test/load.bench.ts 50`:
**50 gleichzeitige Räume mit 200 Spielern, 1 000 gewertete Runden in 24,6 s Laufzeit, 5,7 s CPU-Zeit, 325 MB RSS.**
Dabei liefen Server und alle 200 Clients im selben Prozess. Die Anzeigephasen waren stark verkürzt, sodass
die Rundenrate etwa 40-mal höher lag als im echten Spiel. Für den realen Betrieb heißt das: Eine kleine Instanz
(1 vCPU, 512 MB) ist für Freundesrunden mit reichlich Reserve ausreichend. Eine belastbare Obergrenze auf der
Zielhardware ist damit **nicht** gemessen; bei Bedarf den Benchmark dort erneut ausführen.

## Verbleibende Kosten

| Posten | Einschätzung |
|---|---|
| Server (kleine VM/Container mit dauerhaften WebSockets) | typischerweise wenige Euro pro Monat; Gratis-Angebote nur, wenn sie WebSockets dauerhaft halten |
| Domain | ca. 10–20 € pro Jahr |
| TLS | kostenlos (Let's Encrypt über Caddy) |
| Code-Signatur für Windows (optional, gegen SmartScreen-Warnungen) | kostenpflichtiges Zertifikat bzw. Signierdienst |
| TikTok-API | Freigabe erforderlich; laut öffentlicher Doku keine Nutzungsgebühr bekannt, vor Antrag prüfen |

Kostenpflichtige Scraping-, Captcha- oder Proxy-Dienste werden nicht verwendet. Eine dauerhaft kostenlose
Infrastruktur ist nicht zugesagt.

## Lokaler Hostmodus (optional)

*Einstellungen → Server → „Lokalen Server starten“* startet denselben Server im Desktop-Prozess (Standard-Port
47800). Mitspieler im selben Netz verbinden sich über die angezeigte LAN-Adresse. Über das Internet sind
Portweiterleitung oder ein VPN/Relay nötig; TLS gibt es dabei nicht. Der offizielle TikTok-Import ist im lokalen
Modus nicht verfügbar, weil im Desktop-Build keine Secrets stecken.
