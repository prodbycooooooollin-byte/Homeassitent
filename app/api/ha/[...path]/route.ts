// Server-seitiger Proxy zu einer echten Home-Assistant-Instanz.
//
// Das Zugriffstoken wird ausschließlich hier über Umgebungsvariablen gelesen
// (HA_URL, HA_TOKEN) - niemals im Client-Bundle. Diese Route wird nur
// angesprochen, wenn der Demo-Modus in den Einstellungen deaktiviert ist.
//
// Setze in .env.local (nicht einchecken!):
//   HA_URL=https://homeassistant.local:8123
//   HA_TOKEN=dein-langlebiges-zugriffstoken
//
// Beispiele:
//   GET  /api/ha/ping                          -> prüft Erreichbarkeit
//   GET  /api/ha/snapshot                       -> aggregierter Zustand fürs Dashboard
//   POST /api/ha/services/switch/turn_on        -> ruft switch.turn_on auf

import { NextRequest, NextResponse } from "next/server";

const HA_URL = process.env.HA_URL;
const HA_TOKEN = process.env.HA_TOKEN;

function haHeaders() {
  return {
    Authorization: `Bearer ${HA_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function notConfigured() {
  return NextResponse.json(
    {
      error:
        "Home Assistant ist nicht konfiguriert. Bitte HA_URL und HA_TOKEN als Server-Umgebungsvariablen setzen.",
    },
    { status: 503 },
  );
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  if (!HA_URL || !HA_TOKEN) return notConfigured();
  const path = params.path.join("/");

  if (path === "ping") {
    try {
      const res = await fetch(`${HA_URL}/api/`, { headers: haHeaders(), cache: "no-store" });
      return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
    }
  }

  if (path === "snapshot") {
    // In einer vollständigen Implementierung: /api/states abfragen und in
    // das AppSnapshot-Format aus lib/ha/types.ts transformieren
    // (Entity-IDs auf Räume/Geräte gemäß Einstellungen mappen).
    try {
      const res = await fetch(`${HA_URL}/api/states`, { headers: haHeaders(), cache: "no-store" });
      if (!res.ok) return NextResponse.json({ error: "HA-Anfrage fehlgeschlagen" }, { status: 502 });
      const states = await res.json();
      return NextResponse.json({ states, note: "Mapping auf AppSnapshot noch zu implementieren" });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 });
    }
  }

  if (path === "history" || path === "breakdown") {
    // Für eine vollständige Anbindung: HA-Statistics-API
    // (/api/history/period oder WebSocket "history/statistics_during_period")
    // abfragen und in EnergyPoint[] bzw. EnergyByCategory[] transformieren.
    return NextResponse.json(
      { error: `Endpunkt '${path}' ist für die echte HA-Anbindung noch zu implementieren.` },
      { status: 501 },
    );
  }

  return NextResponse.json({ error: "Unbekannter Endpunkt" }, { status: 404 });
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  if (!HA_URL || !HA_TOKEN) return notConfigured();
  const path = params.path.join("/");

  if (path.startsWith("services/")) {
    const [, domain, service] = path.split("/");
    const body = await req.json().catch(() => ({}));
    try {
      const res = await fetch(`${HA_URL}/api/services/${domain}/${service}`, {
        method: "POST",
        headers: haHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) return NextResponse.json({ error: "Service-Aufruf fehlgeschlagen" }, { status: 502 });
      return NextResponse.json(await res.json().catch(() => ({})));
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Unbekannter Endpunkt" }, { status: 404 });
}
