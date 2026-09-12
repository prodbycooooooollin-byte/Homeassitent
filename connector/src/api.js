// Client für die Craftboard-Ingest-API. Jede Anfrage trägt den Agent-Key im
// Header - die Website prüft ihn gegen den serverseitig gehashten Wert
// (siehe lib/ingest/auth.ts der Webapp). Fehler werden geloggt, aber
// werfen nicht den ganzen Prozess um: die nächste Meldung folgt im
// nächsten Zyklus.
export function createApiClient(config) {
  async function post(path, body) {
    const url = `${config.craftboardUrl}${path}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-craftboard-agent-key": config.agentApiKey,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[craftboard] ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error(`[craftboard] ${path} fehlgeschlagen: ${err.message}`);
      return null;
    }
  }

  return {
    snapshot: (payload) => post("/api/ingest/snapshot", payload),
    sessionEvent: (payload) => post("/api/ingest/session-event", payload),
    death: (payload) => post("/api/ingest/death", payload),
    serverStatus: (payload) => post("/api/ingest/server-status", payload),
    link: (payload) => post("/api/ingest/link", payload),
    positions: (payload) => post("/api/ingest/positions", payload),
  };
}
