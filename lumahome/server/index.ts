// LumaHome-Server: liefert die Oberfläche aus, hält die Verbindung zu Home
// Assistant und speichert das Live-Projekt. Läuft lokal (Standard: nur dieser
// Rechner, siehe HOST) und benötigt keine externen Dienste.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { HaState } from "../src/devices/ha-types";
import { isAllowedService } from "../src/devices/ha-types";
import type { StreamEvent } from "../src/sources/types";
import { checkPin, issueSession, roleOf, sessionCookie, type Role } from "./auth";
import { config, haConfigured, haHostLabel } from "./config";
import { ha } from "./ha-connection";
import { loadProject, saveProject } from "./project-store";

const VERSION = "0.1.0";
const MAX_BODY = 20 * 1024 * 1024;

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new Error("Anfrage zu groß");
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function need(req: IncomingMessage, res: ServerResponse, role: Exclude<Role, "none">): boolean {
  const have = roleOf(req);
  const ok = role === "view" ? have !== "none" : have === "edit";
  if (!ok) json(res, have === "none" ? 401 : 403, { error: role === "edit" ? "Bearbeiten erfordert die Bearbeitungs-PIN." : "Anmeldung erforderlich." });
  return ok;
}

function csrfOk(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.headers["x-lumahome"] === "1") return true;
  json(res, 400, { error: "Fehlender Anfragekopf X-LumaHome." });
  return false;
}

// ---- Live-Stream (Server-Sent Events) ----
const clients = new Set<ServerResponse>();

function sse(res: ServerResponse, ev: StreamEvent) {
  res.write(`data: ${JSON.stringify(ev)}\n\n`);
}

function broadcast(ev: StreamEvent) {
  for (const c of clients) sse(c, ev);
}

function snapshotEvent(): StreamEvent {
  return { type: "snapshot", states: [...ha.states.values()], registry: ha.registry };
}

ha.on("status", (status) => broadcast({ type: "status", status }));
ha.on("snapshot", () => broadcast(snapshotEvent()));
ha.on("state", (entity_id: string, new_state: HaState | null) => broadcast({ type: "state", entity_id, new_state }));

function stream(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  clients.add(res);
  sse(res, { type: "status", status: ha.status });
  if (ha.isSynced) sse(res, snapshotEvent());
  const hb = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(hb);
    clients.delete(res);
  });
}

// ---- Erlaubte Dienstdaten ----
const ALLOWED_DATA = new Set(["brightness_pct", "color_temp_kelvin", "hs_color", "rgb_color", "transition", "position", "hvac_mode", "temperature"]);

async function api(req: IncomingMessage, res: ServerResponse, path: string) {
  const method = req.method ?? "GET";

  if (path === "/api/health") return json(res, 200, { ok: true, version: VERSION });

  if (path === "/api/session" && method === "GET") {
    return json(res, 200, {
      role: roleOf(req),
      pins: { view: !!config.viewPin, edit: !!config.editPin },
      ha: { configured: haConfigured(), host: haHostLabel() },
      version: VERSION,
    });
  }
  if (path === "/api/session" && method === "POST") {
    if (!csrfOk(req, res)) return;
    const body = (await readBody(req)) as { pin?: unknown };
    const pin = typeof body.pin === "string" ? body.pin : "";
    const r = checkPin(req.socket.remoteAddress ?? "?", pin);
    if (r === "rate_limited") return json(res, 429, { error: "Zu viele Versuche. Bitte eine Minute warten." });
    if (!r) return json(res, 401, { error: "PIN nicht korrekt." });
    return json(res, 200, { role: r }, { "Set-Cookie": sessionCookie(issueSession(r)) });
  }
  if (path === "/api/session" && method === "DELETE") {
    if (!csrfOk(req, res)) return;
    return json(res, 200, { role: "none" }, { "Set-Cookie": sessionCookie(null) });
  }

  if (path === "/api/ha/stream") {
    if (!need(req, res, "view")) return;
    return stream(req, res);
  }

  if (path === "/api/ha/service" && method === "POST") {
    if (!csrfOk(req, res) || !need(req, res, "view")) return;
    const body = (await readBody(req)) as { domain?: string; service?: string; entity_id?: string; data?: Record<string, unknown> };
    const { domain = "", service = "", entity_id = "" } = body;
    if (!isAllowedService(domain, service)) return json(res, 400, { error: `Dienst ${domain}.${service} ist nicht freigegeben.` });
    if (!/^[a-z_]+\.[a-z0-9_]+$/.test(entity_id) || entity_id.split(".")[0] !== domain) return json(res, 400, { error: "Ungültige Entität." });
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.data ?? {})) if (ALLOWED_DATA.has(k)) data[k] = v;
    try {
      const result = await ha.command<{ context?: { id: string } }>({
        type: "call_service",
        domain,
        service,
        service_data: data,
        target: { entity_id },
      });
      return json(res, 200, { contextId: result?.context?.id ?? null });
    } catch (e) {
      return json(res, 502, { error: (e as Error).message });
    }
  }

  if (path === "/api/ha/statistic-ids" && method === "GET") {
    if (!need(req, res, "view")) return;
    try {
      return json(res, 200, await ha.command({ type: "recorder/list_statistic_ids", statistic_type: undefined }));
    } catch (e) {
      return json(res, 502, { error: (e as Error).message });
    }
  }

  if (path === "/api/ha/statistics" && method === "POST") {
    if (!csrfOk(req, res) || !need(req, res, "view")) return;
    const b = (await readBody(req)) as { ids?: string[]; start?: number; end?: number; period?: string; types?: string[] };
    if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 200) return json(res, 400, { error: "Ungültige Statistik-IDs." });
    if (!["5minute", "hour", "day", "week", "month"].includes(b.period ?? "")) return json(res, 400, { error: "Ungültige Periode." });
    try {
      const result = await ha.command(
        {
          type: "recorder/statistics_during_period",
          start_time: new Date(Number(b.start)).toISOString(),
          end_time: new Date(Number(b.end)).toISOString(),
          statistic_ids: b.ids,
          period: b.period,
          types: (b.types ?? ["mean"]).filter((t) => ["mean", "change", "sum", "state", "min", "max"].includes(t)),
        },
        30_000,
      );
      return json(res, 200, result);
    } catch (e) {
      return json(res, 502, { error: (e as Error).message });
    }
  }

  if (path === "/api/ha/history" && method === "POST") {
    if (!csrfOk(req, res) || !need(req, res, "view")) return;
    const b = (await readBody(req)) as { ids?: string[]; start?: number; end?: number };
    if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 100) return json(res, 400, { error: "Ungültige Entitäten." });
    try {
      const result = await ha.command(
        {
          type: "history/history_during_period",
          start_time: new Date(Number(b.start)).toISOString(),
          end_time: new Date(Number(b.end)).toISOString(),
          entity_ids: b.ids,
          minimal_response: true,
          no_attributes: true,
          include_start_time_state: true,
          significant_changes_only: false,
        },
        30_000,
      );
      return json(res, 200, result);
    } catch (e) {
      return json(res, 502, { error: (e as Error).message });
    }
  }

  if (path === "/api/ha/energy-prefs" && method === "GET") {
    if (!need(req, res, "view")) return;
    try {
      return json(res, 200, await ha.command({ type: "energy/get_prefs" }));
    } catch (e) {
      return json(res, 200, null);
    }
  }

  if (path === "/api/project" && method === "GET") {
    if (!need(req, res, "view")) return;
    try {
      const p = loadProject();
      if (!p) return json(res, 404, { error: "Noch kein Projekt gespeichert." });
      return json(res, 200, p);
    } catch (e) {
      return json(res, 500, { error: (e as Error).message });
    }
  }
  if (path === "/api/project" && method === "PUT") {
    if (!csrfOk(req, res) || !need(req, res, "edit")) return;
    const b = (await readBody(req)) as { project?: unknown; baseRevision?: number | null };
    const r = saveProject(b.project, typeof b.baseRevision === "number" ? b.baseRevision : null);
    if (r.ok) return json(res, 200, r);
    if (r.status === 409) return json(res, 409, { error: "Das Projekt wurde zwischenzeitlich an einem anderen Gerät geändert.", revision: r.revision });
    return json(res, 422, { error: "Projekt ungültig", details: r.errors });
  }

  if (path === "/api/test/drop-ha" && method === "POST" && process.env.LUMAHOME_TEST_HOOKS === "1") {
    ha.dropForTest();
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Unbekannter Endpunkt" });
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function serveStatic(req: IncomingMessage, res: ServerResponse, path: string) {
  if (!existsSync(config.distDir)) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Oberfläche noch nicht gebaut. Bitte `npm run build` ausführen oder `npm run dev` verwenden.");
    return;
  }
  const safe = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, "");
  let file = join(config.distDir, safe);
  if (!file.startsWith(config.distDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(config.distDir, "index.html");
  const ext = extname(file);
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  createReadStream(file).pipe(res);
  void req;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) await api(req, res, url.pathname);
    else serveStatic(req, res, url.pathname);
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: (e as Error).message });
    else res.end();
  }
});

ha.start();
server.listen(config.port, config.host, () => {
  const ha = haConfigured() ? `Home Assistant: ${haHostLabel()}` : "Home Assistant: nicht konfiguriert (nur Demo-Modus)";
  console.log(`LumaHome ${VERSION} läuft auf http://${config.host}:${config.port}\n${ha}`);
  if (config.host !== "127.0.0.1" && !config.viewPin && !config.editPin) {
    console.warn("Hinweis: Server ist im Netzwerk erreichbar und keine PIN ist gesetzt – jeder im Netz kann bearbeiten.");
  }
});
