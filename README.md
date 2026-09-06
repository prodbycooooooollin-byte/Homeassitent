# Smart-Home-Center

Eine moderne, vollständig responsive Web-App zur Überwachung und Steuerung
eines Zuhauses – als Ersatz-Dashboard für Home Assistant. Dunkles,
futuristisches Design, abgerundete Karten, dezente Leuchteffekte und eine
klare Navigation für Desktop und Smartphone.

## Tech-Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** mit CSS-Variablen-basiertem Design-System (Hell-/Dunkelmodus)
- **Recharts** für Linien-, Flächen-, Balken- und Donut-Diagramme
- **lucide-react** für Icons

## Loslegen

```bash
npm install
npm run dev
```

Die App startet standardmäßig im **Demo-Modus** mit realistischen
Beispieldaten (`lib/mock-data.ts`) – keine Home-Assistant-Instanz nötig.

## Architektur

```
lib/
  types.ts            Domain-Modelle (Device, Room, Automation, ...)
  mock-data.ts         Beispieldaten für den Demo-Modus
  ha/
    types.ts           HaClient-Interface (Vertrag zwischen UI und Datenquelle)
    mock-client.ts      Demo-Implementierung (simulierte Latenz & Fehler)
    real-client.ts      Implementierung für eine echte HA-Instanz
    index.ts            Factory: wählt Mock- oder Real-Client
  state/
    app-context.tsx     Globaler State, optimistische UI-Updates, Rollback
    toast-context.tsx   Toast-Benachrichtigungen
    settings.ts          Einstellungen (localStorage-persistiert)
app/
  page.tsx              Startseite
  energie/ klima/ geraete/ raeume/ automationen/ sicherheit/ einstellungen/
  api/ha/[...path]/route.ts   Serverseitiger Proxy zu einer echten HA-Instanz
components/
  ui/                    Wiederverwendbare Primitiven (Card, Button, Toggle, ...)
  dashboard/ climate/ devices/ rooms/ automations/ security/ settings/
```

Die UI kennt nur das `HaClient`-Interface, nie die konkrete Implementierung –
so lässt sich später eine echte Home-Assistant-Anbindung (REST/WebSocket)
ergänzen, ohne eine einzige Komponente anzufassen.

## Echte Home-Assistant-Anbindung aktivieren

1. `.env.local.example` nach `.env.local` kopieren und `HA_URL` sowie
   `HA_TOKEN` (Long-Lived Access Token) eintragen.
2. In den **Einstellungen** der App den **Demo-Modus** deaktivieren.
3. Das Zugriffstoken bleibt dabei ausschließlich serverseitig
   (`app/api/ha/[...path]/route.ts`) – es wird nie im Frontend gespeichert
   oder ausgeliefert.

`lib/ha/real-client.ts` enthält bereits die Service-Aufrufe
(`switch.turn_on`, `climate.set_temperature`, ...); die Snapshot- und
Verlaufs-Endpunkte (`/api/ha/snapshot`, `/api/ha/history`) müssen für eine
produktive Anbindung noch auf die konkreten Home-Assistant-Entities des
jeweiligen Haushalts gemappt werden (Kommentare markieren die Stellen).

## Bekannte Folgearbeiten

- Die Next.js-Version (14.2.35) hat laut `npm audit` noch offene Advisories,
  die erst mit einem Major-Upgrade auf Next 16 vollständig behoben sind.
- Icon-Set für `public/manifest.json` (PWA-Icons) ergänzen.
