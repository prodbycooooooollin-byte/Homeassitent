# WinRace

Echtzeit-Plattform für Twitch-Team-Challenges: zwei Teams, eine
Spieleliste, ein Sieger. Vollständig funktionsfähige Full-Stack-App –
keine Design-Demo. Authentifizierung, Räume, Rollen, Datenbank,
Echtzeit-Synchronisierung, Fortschrittsverwaltung, Twitch-Streams und
OBS-Overlays sind real implementiert und Ende-zu-Ende getestet.

> Dieses Verzeichnis ist eine eigenständige App innerhalb dieses Repos.
> Der Rest des Repos (Smart-Home-Center) ist davon unberührt – einzige
> Ausnahme ist `render.yaml` im Repo-Root (Render erwartet Blueprints dort),
> das ausschließlich diese App beschreibt und Smart-Home-Center nicht antastet.

## Tech-Stack

- **Next.js 14** (App Router) + **TypeScript**, strikt
- **Tailwind CSS**, eigenes dunkles Design-System (kein UI-Kit)
- **PostgreSQL** + **Prisma ORM** (vollständiges Schema, siehe `prisma/schema.prisma`)
- **NextAuth** (Credentials + optionales Twitch-OAuth), bcrypt, JWT-Sessions
- **Socket.io** über einen kombinierten Node-Server (`server.ts`) für echte Raum-Echtzeit-Kanäle
- **Zod** für Validierung server- und clientseitig
- Twitch **Helix API** (Live-Status, serverseitig) + offizielles Twitch-**Embed** (Player/Chat)

## Schnellstart

```bash
cd winrace
npm install
cp .env.example .env        # Werte anpassen, siehe unten
docker compose up -d db     # lokale Postgres-Instanz (Alternative: eigene DB-URL eintragen)
npx prisma migrate dev      # Schema anlegen
npm run seed                # Demo-Raum "WR-DEMO1" befüllen
npm run dev                 # Next.js + Socket.io unter http://localhost:3000
```

Öffne `http://localhost:3000` – die Startseite verlinkt direkt auf die
Demo (`/demo`), auf „Raum erstellen“ und „Raum beitreten“.

### Wichtige Umgebungsvariablen (`.env`)

| Variable | Pflicht | Zweck |
|---|---|---|
| `DATABASE_URL` | ja | PostgreSQL-Verbindung |
| `NEXTAUTH_SECRET` | ja | Session-Verschlüsselung (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | ja | Öffentliche Basis-URL |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | optional | Twitch-Login-Button, Live-Status-Abfrage, Kanal-Validierung. Ohne diese Variablen funktioniert die App vollständig weiter – Twitch-Login ist ausgeblendet, Kanäle gelten als "nicht verifiziert", Live-Status wird nicht abgefragt (Embeds funktionieren trotzdem, da der Twitch-Player keine eigenen Zugangsdaten braucht). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | optional | Passwort-Reset-Mails. Ohne SMTP wird der Reset-Link in die Server-Konsole geschrieben und im Dev-Modus zusätzlich direkt in der UI angezeigt. |
| `NEXT_PUBLIC_SITE_URL` | ja | Für generierte Einladungs-/Overlay-Links |
| `PORT` | nein | Port des kombinierten Servers (Default 3000) |

## Deployment (24/7-Betrieb)

WinRace braucht einen **dauerhaft laufenden Node-Prozess** (der kombinierte
Next.js + Socket.io Server in `server.ts`) – kein klassisches
Vercel-Serverless. Mitgeliefert: ein produktionsreifes `Dockerfile`
(Multi-Stage-Build), `.dockerignore`, ein `GET /api/health`-Endpunkt für
Health-Checks sowie ein `render.yaml`-Blueprint im Repo-Root. `server.ts`
liest `PORT` und bindet an `0.0.0.0` – kompatibel mit Railway, Render,
Fly.io und jedem Docker-Host ohne Anpassung.

### Option A: Render (ein Klick über das Blueprint)

1. Repository bei GitHub verbunden lassen, im Render-Dashboard **New +** →
   **Blueprint** wählen und dieses Repo auswählen. Render liest
   `render.yaml` im Repo-Root und legt daraus automatisch einen Web-Service
   (baut aus `winrace/Dockerfile`) **und** eine verwaltete PostgreSQL-
   Datenbank an, bereits über `DATABASE_URL` verknüpft.
2. Nach dem ersten Deploy: Render vergibt eine URL (z.B.
   `https://winrace.onrender.com`). Diese als `NEXTAUTH_URL` **und**
   `NEXT_PUBLIC_SITE_URL` im Dashboard eintragen (vor dem ersten Deploy
   noch nicht bekannt, daher `sync: false` im Blueprint) und den Service
   einmal manuell neu deployen.
3. Optional `TWITCH_CLIENT_ID`/`_SECRET` bzw. `SMTP_*` im Dashboard
   nachtragen (siehe Tabelle oben).
4. `npm run seed` einmalig über die Render-Shell des Services ausführen,
   falls der Demo-Raum gewünscht ist.

### Option B: Railway

1. **New Project** → **Deploy from GitHub repo** → dieses Repo wählen.
2. Da die App in `winrace/` liegt: in den Service-Einstellungen **Root
   Directory** auf `winrace` setzen. Railway erkennt das `Dockerfile`
   automatisch.
3. **+ New** → **Database** → **PostgreSQL** im selben Projekt hinzufügen;
   Railway stellt `DATABASE_URL` als Referenzvariable bereit, im
   Web-Service unter Variables auf die DB-Variable verweisen (oder Railways
   "Reference"-Funktion nutzen).
4. Die restlichen Variablen aus der Tabelle oben eintragen. `NEXTAUTH_URL`
   und `NEXT_PUBLIC_SITE_URL` auf die von Railway vergebene Domain setzen
   (unter Settings → Networking eine öffentliche Domain generieren, dann
   erneut deployen).

### Nach jedem Deploy (beide Optionen)

- Der Container-Start führt automatisch `prisma migrate deploy` aus
  (`npm run start:deploy`, siehe `Dockerfile`) – neue Migrationen werden
  bei jedem Deploy angewendet, ohne manuellen Schritt.
- `TWITCH_CLIENT_ID`/`_SECRET` gesetzt? Dann in der Twitch-App-Konsole
  (dev.twitch.tv) die OAuth-Redirect-URL auf
  `<NEXTAUTH_URL>/api/auth/callback/twitch` mit der echten Produktions-
  domain aktualisieren.
- Health-Check-Pfad für eigene Docker-/Kubernetes-Setups:
  `GET /api/health` (prüft zusätzlich die Datenbankverbindung, liefert
  `503` statt `200` wenn Postgres nicht erreichbar ist).

### Eigener Server per Docker (ohne Railway/Render)

```bash
cd winrace
docker build -t winrace .
docker run -d --name winrace -p 3000:3000 --env-file .env winrace
```

Läuft der Container neben einer eigenen Postgres-Instanz (nicht im selben
Docker-Netzwerk), `DATABASE_URL` in `.env` entsprechend auf deren
erreichbare Adresse setzen. Für Neustarts/Autostart einen Prozess-Manager
wie `systemd` oder `docker run --restart unless-stopped` verwenden.

## Architektur

```
server.ts                     Kombinierter Next.js + Socket.io Server (siehe Kommentare darin)
Dockerfile                     Produktions-Image (Multi-Stage), siehe Abschnitt "Deployment"
../render.yaml                 Render-Blueprint (liegt im Repo-Root, siehe "Deployment")
prisma/schema.prisma           Vollständiges Datenmodell
prisma/seed.ts                 Demo-Raum "WinRace Demo-Arena" (isDemo: true, klar isoliert)

lib/
  auth.ts                      NextAuth-Konfiguration (Credentials + optional Twitch)
  session.ts                   getCurrentUser(), Mitgliedschafts-Lookup
  codes.ts                     Raumcodes, Opaque-Tokens (Invite/Overlay), Passwort-Hashing
  rate-limit.ts                In-Memory Rate-Limiter (siehe Hinweis zu Skalierung darin)
  twitch.ts                    Serverseitiger Helix-Client (App-Access-Token, Live-Status)
  socket-server.ts             Socket.io Singleton + emitToRoom/emitToUser
  server/                      Geschäftslogik (Rooms, Members, Challenge, Progress, Stats, Overlay, Demo, Activity)
                                 – von API-Routen UND Server Components genutzt (keine Duplizierung)
  client/                      Client-seitiger State (RoomStateProvider-Context, Ableitungen wie "aktuelles Spiel")
  hooks/                       Realtime-, Autosave-, Twitch-Live-Status-Hooks
  validation.ts                Alle Zod-Schemas
  types.ts                     Client-sichere Typen (Server-Typen mit Date → ISO-String)

app/
  (site)/                      Eigenständige Root-Layout-Gruppe: dunkles Design, Auth-Provider, Toasts
    page.tsx                   Landingpage
    login/ register/ forgot-password/ reset-password/[token]/
    rooms/new/ rooms/join/ invite/[token]/
    rooms/[code]/lobby/        Team-Wahl vor dem Start
    rooms/[code]/dashboard/    Host-/Team-Dashboard mit Tabs (Layout hält den Echtzeit-Context)
    rooms/[code]/live/         Öffentliche Live-Übersicht
    rooms/[code]/streams/      Stream-Zentrale (auch als Dashboard-Tab eingebettet)
    rooms/[code]/stats/        Statistikseite
    profile/ archive/
  (overlay)/                   Eigene Root-Layout-Gruppe: transparenter Hintergrund für OBS
    overlay/[code]/[type]/     7 eigenständige Overlay-Seiten
  api/                         Route Handler (REST), siehe unten

components/
  ui/                          Eigene, barrierearme Primitiven (Button, Dialog, ProgressRing, ...)
  rooms/ streams/ overlay/ auth/ profile/ layout/
```

### Warum zwei Root-Layouts?

Next.js App-Router unterstützt mehrere unabhängige Root-Layouts über
Route-Groups. `(site)` liefert das dunkle UI mit Session-/Toast-Provider,
`(overlay)` liefert einen **echten transparenten** `<body>` für OBS-
Browserquellen (verifiziert: `getComputedStyle(body).backgroundColor` ist
`rgba(0,0,0,0)`). Beide teilen sich `app/globals.css`; die dunkle
Hintergrundfarbe ist an die Klasse `.site-shell` gebunden, damit sie nicht
versehentlich auf Overlay-Seiten durchschlägt.

### Echtzeit

Ein einziger Node-Prozess (`server.ts`) bedient sowohl Next.js
(SSR/API-Routen) als auch Socket.io. API-Route-Handler rufen nach einer
erfolgreichen DB-Schreiboperation `emitToRoom(roomId, event, payload)`
auf; Clients sind einem Kanal pro Raum beigetreten
(`RoomStateProvider`/`useOverlayData`). Bei Verbindungsabbruch zeigt ein
Banner den Status an; nach Wiederverbindung wird der komplette Zustand
per REST nachgeladen (kein Vertrauen auf während der Trennung verpasste
Events). Eine einfache In-Memory-Präsenz zeigt Online-Status pro
Mitglied.

**Hinweis für den Betrieb:** Der kombinierte Server benötigt einen lang
laufenden Node-Prozess – siehe Abschnitt [Deployment](#deployment-24-7-betrieb)
für Railway/Render/Docker. Auf klassischem Vercel-Serverless funktioniert
der Socket.io-Teil nicht ohne Weiteres – dort müsste auf einen externen
Realtime-Dienst (z.B. Pusher, Ably oder Supabase Realtime) umgestellt
werden. Die Emit-Aufrufe sind an einer zentralen Stelle
(`lib/socket-server.ts`) gebündelt, ein Austausch ist entsprechend lokal
begrenzt.

### Atomare Fortschritts-Updates

`lib/server/progress.ts` sperrt die betroffene `TeamGameProgress`-Zeile
per `SELECT ... FOR UPDATE` innerhalb einer Transaktion, bevor der neue
Wert berechnet wird – zwei gleichzeitige Klicks führen garantiert zu zwei
korrekten Inkrementen statt einem verlorenen Update. Wird durch eine
Änderung das letzte offene Spiel eines Teams abgeschlossen, wird
zusätzlich die `Challenge`-Zeile gesperrt, um nahezu gleichzeitige
Schluss-Siege beider Teams eindeutig nach Datenbank-Commit-Reihenfolge
aufzulösen (siehe Kommentare in der Datei).

## Rollen & Berechtigungen

Zentral und ausschließlich serverseitig in `lib/server/permissions.ts`
geprüft – jede API-Route ruft diese Funktionen erneut auf; das Frontend
blendet Aktionen anhand derselben Regeln nur zusätzlich aus (bessere UX,
kein Sicherheitsmechanismus).

## Sicherheit

- Passwörter (Nutzer- und Raumpasswörter) mit bcrypt gehasht
- Einladungs- und Overlay-Tokens: nur der SHA-256-Hash wird gespeichert,
  das Klartext-Token wird einmalig angezeigt (wie Personal-Access-Tokens)
- Serverseitige Zod-Validierung aller Eingaben
- Rate-Limiting für Fortschritts-Updates, Login/Registrierung,
  Passwort-Reset, Einladungen, Beitritte
- Kein Raumbeitritt durch Erraten der Raum-ID: Code **und** Passwort oder
  ein serverseitig geprüftes Einladungstoken sind zwingend erforderlich

## Bekannte Grenzen / bewusste Trade-offs

- **Rate-Limiting & Präsenz** sind In-Memory (siehe Kommentare in
  `lib/rate-limit.ts` und `server.ts`) – korrekt für eine einzelne
  Instanz; für horizontale Skalierung müsste das nach Redis wandern.
- **Twitch-API-Zugangsdaten** sind in dieser Umgebung nicht hinterlegt
  (keine Test-Zugangsdaten verfügbar). Der komplette Code-Pfad
  (App-Access-Token, Live-Status, Kanal-Validierung) ist implementiert
  und greift automatisch, sobald `TWITCH_CLIENT_ID`/`_SECRET` gesetzt
  sind; bis dahin degradiert die App sauber (Kanäle "unverifiziert",
  Live-Status "offline"), der Twitch-Embed-Player selbst funktioniert
  unabhängig davon immer.
- **i18n:** Die Architektur trennt UI-Text sauber von Geschäftslogik
  (keine deutschen Strings in `lib/server/*`) und bündelt
  wiederverwendete Enum-Beschriftungen in `lib/labels.ts` – ein
  technisch sinnvoller Ansatzpunkt für weitere Sprachen. Eine
  Locale-Umschaltung selbst ist (noch) nicht verdrahtet.
- **"Aktuelles Spiel"** kann von Team-Leads/Mitgliedern explizit markiert
  werden (`Team.currentGameId`); ohne Auswahl wird es automatisch aus
  dem Fortschritt abgeleitet (zuletzt aktives, sonst erstes offenes
  Spiel) – siehe `lib/client/derive.ts`.
- **E-Mail-Versand** erfordert einen SMTP-Server; ohne Konfiguration
  funktioniert der Passwort-Reset-Flow trotzdem (Link erscheint in der
  Server-Konsole bzw. im Dev-Modus direkt auf der Seite).

## Demo-Modus

`npm run seed` legt einen öffentlichen, klar als Demo gekennzeichneten
Raum an (`isDemo: true`, Code `WR-DEMO1`, erreichbar über `/demo`).
„Night Raiders“ vs. „Zero Mercy“ mit vier vorkonfigurierten Spielen und
realistischem (aber eindeutig erfundenem) Fortschritt. Auf der
Live-Ansicht dieses Raums erscheinen zusätzlich „Fortschritt
simulieren“/„Zurücksetzen“-Buttons – beide Endpunkte
(`/api/demo/simulate`, `/api/demo/reset`) sind hart auf `isDemo: true`
beschränkt und berühren niemals echte Räume.

## Tests, die durchgeführt wurden

Diese App wurde nicht nur geschrieben, sondern durchgängig gegen eine
echte PostgreSQL-Instanz und über einen echten Browser (Playwright)
verifiziert, u.a.: Registrierung/Login, Raum erstellen, Beitritt über
Code+Passwort, Team-Wahl, Spiele-Konfiguration, Start der Challenge,
**Zwei-Client-Echtzeit-Sync** (Fortschritt eines Nutzers erscheint ohne
Reload bei einem zweiten, gleichzeitig verbundenen Nutzer), automatische
Gewinner-Erkennung inkl. Host-Bestätigung, Archivierung, OBS-Overlay-
Transparenz (`omitBackground`-Screenshot-Vergleich) sowie alle sieben
Overlay-Varianten.
