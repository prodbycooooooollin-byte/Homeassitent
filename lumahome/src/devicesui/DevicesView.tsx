// Bereich „Geräte“: Verbindung, Zuordnungen und Gerätezustände verwalten.
import { clsx } from "clsx";
import { AlertTriangle, Link2, Link2Off, PlugZap, RefreshCw, Search, Unplug, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { BindingTarget } from "@/model/types";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { isConnected, useLive } from "@/store/live";
import { useApp, getDemoSource, logout, startDemo, switchMode } from "@/app/boot";
import { DirectSource } from "@/sources/direct";
import { LogOut } from "lucide-react";
import { capabilityOf, domainOf, friendlyName, roleForCapability } from "@/devices/capabilities";
import { describeBinding } from "@/devices/view";
import { stateSummary } from "@/devices/state";
import { areaNameOf, norm, rolesForTarget, targetLabel } from "@/devices/suggestions";
import { roomOfBinding, insights } from "@/home/insights";
import { DeviceControl, relTime } from "@/home/DeviceControls";
import { statusLabel } from "@/shell/TopBar";
import { Dialog, Notice, Segmented } from "@/ui/primitives";
import { newId } from "@/model/ids";
import { DemoSource } from "@/sources/demo";
import { LiveSource } from "@/sources/live";
import { PinLogin } from "@/shell/SettingsSheet";
import { itemRoom } from "@/geometry/placement";

const DOMAINS: { id: string; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "light", label: "Licht" },
  { id: "switch", label: "Schalter" },
  { id: "cover", label: "Rollläden" },
  { id: "contact", label: "Kontakte" },
  { id: "climate", label: "Klima" },
  { id: "sensor", label: "Sensoren" },
];

function Connection() {
  const status = useLive((s) => s.status);
  const lastEventAt = useLive((s) => s.lastEventAt);
  const count = useLive((s) => Object.keys(s.states).length);
  const mode = useProject((s) => s.mode);
  const session = useApp((s) => s.session);
  const serverReachable = useApp((s) => s.serverReachable);
  const platform = useApp((s) => s.platform);
  const haUrl = useApp((s) => s.haUrl);
  const source = useLive((s) => s.source);
  const user = source instanceof DirectSource ? source.socket?.user ?? null : null;
  const toast = useUi((s) => s.toast);
  const l = statusLabel(status);
  const [demoWeather, setDemoWeather] = useState("auto");
  const reconnect = () => {
    if (mode === "demo") useLive.getState().setSource(getDemoSource() ?? new DemoSource());
    else if (platform === "web" && source instanceof DirectSource) useLive.getState().setSource(new DirectSource(source.url, source.token));
    else useLive.getState().setSource(new LiveSource());
  };
  return (
    <section className="panel-flat space-y-3 p-4" aria-label="Verbindung">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Verbindung</h2>
        <Segmented
          label="Betriebsart"
          size="sm"
          value={mode}
          onChange={(m) => void switchMode(m)}
          options={[
            { value: "live", label: "Live (Home Assistant)" },
            { value: "demo", label: "Demo" },
          ]}
        />
      </div>
      <div className={clsx("rounded-2xl p-3 text-sm", l.tone === "ok" ? "bg-sage-soft" : l.tone === "demo" ? "bg-energy-soft" : l.tone === "error" ? "bg-danger-soft" : "bg-surface-2")} data-testid="connection-detail">
        <p className="font-semibold">{l.text}</p>
        {status.kind === "connected" && <p className="text-ink-2">Home Assistant {status.haVersion ?? ""} · {session?.ha.host} · verbunden {relTime(status.since)} · {count} Entitäten</p>}
        {status.kind === "reconnecting" && <p>Grund: {status.reason}. Versuch {status.attempt}. Angezeigte Zustände sind der letzte bekannte Stand und als veraltet markiert.</p>}
        {status.kind === "server_unreachable" && <p>{status.reason}. Die App versucht es automatisch erneut.</p>}
        {status.kind === "auth_failed" && platform === "web" && <p>Bitte abmelden und mit einem neuen Token wieder anmelden.</p>}
        {status.kind === "not_configured" && <p>Auf dem LumaHome-Server sind HA_URL und HA_TOKEN nicht gesetzt (siehe README). Planen ist trotzdem möglich.</p>}
        {status.kind === "auth_failed" && <p>{status.reason}. Bitte den Zugriffstoken in der Server-Konfiguration prüfen.</p>}
        {status.kind === "demo" && <p>Simulierte Geräte und Beispieldaten – getrennt vom Live-Projekt. Nichts davon wird an Home Assistant gesendet.</p>}
        {lastEventAt && <p className="text-xs text-ink-2">Letzte Aktualisierung {relTime(lastEventAt)}</p>}
      </div>
      {mode === "live" && platform === "server" && !serverReachable && <Notice tone="warn">Der lokale LumaHome-Server ist nicht erreichbar.</Notice>}
      {platform === "web" && haUrl && mode === "live" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line px-3 py-2 text-sm" data-testid="ha-account">
          <span>
            Angemeldet bei <strong>{haUrl.replace(/^https?:\/\//, "")}</strong>
            {user ? ` als ${user.name}${user.is_admin ? " (Administrator)" : ""}` : ""}
          </span>
          <button className="btn-secondary min-h-[40px] px-3 text-xs" onClick={() => void logout()} data-testid="logout">
            <LogOut size={14} /> Abmelden
          </button>
        </div>
      )}
      {status.kind === "forbidden" && <PinLogin />}
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={reconnect}>
          <RefreshCw size={16} /> Neu verbinden
        </button>
        {mode === "demo" && (
          <>
            <button
              className="btn-secondary"
              onClick={() => {
                const n = getDemoSource()?.simulateExternalChange();
                if (n) toast(`Externe Änderung simuliert: ${n}`, "info");
              }}
              data-testid="simulate-external"
            >
              <Wand2 size={16} /> Externe Änderung simulieren
            </button>
            <button className="btn-secondary" onClick={() => getDemoSource()?.simulateDisconnect()} data-testid="simulate-disconnect">
              <Unplug size={16} /> Verbindungsabbruch simulieren
            </button>
            <button className="btn-ghost" onClick={() => void startDemo(true)}>
              Demo zurücksetzen
            </button>
            <div className="w-full">
              <p className="label">Demo-Wetter (wirkt auch auf die PV-Leistung)</p>
              <Segmented
                label="Demo-Wetter"
                size="sm"
                value={demoWeather}
                onChange={(v) => {
                  setDemoWeather(v);
                  getDemoSource()?.setWeather(v === "auto" ? null : v);
                }}
                options={[
                  { value: "auto", label: "Automatisch" },
                  { value: "sunny", label: "Sonne" },
                  { value: "cloudy", label: "Wolken" },
                  { value: "rainy", label: "Regen" },
                  { value: "snowy", label: "Schnee" },
                  { value: "lightning-rainy", label: "Gewitter" },
                ]}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function AssignDialog({ entityId, onClose }: { entityId: string; onClose: () => void }) {
  const project = useProject((s) => s.project)!;
  const apply = useProject((s) => s.apply);
  const states = useLive((s) => s.states);
  const registry = useLive((s) => s.registry);
  const toast = useUi((s) => s.toast);
  const [q, setQ] = useState("");
  const s = states[entityId];
  const cap = s ? capabilityOf(s) : null;
  const role = cap ? roleForCapability(cap) : null;
  const area = areaNameOf(entityId, registry);
  const name = friendlyName(s, entityId);
  const targets = useMemo(() => {
    if (!role) return [];
    const all: { target: BindingTarget; label: string; room: string | null; score: number; reason: string | null }[] = [];
    const add = (target: BindingTarget, room: string | null) => {
      if (!rolesForTarget(project, target).includes(role)) return;
      const label = targetLabel(project, target).name;
      let score = 0;
      let reason: string | null = null;
      if (room && area && norm(room) === norm(area)) {
        score += 50;
        reason = `Bereich „${area}“ passt`;
      } else if (room && norm(name).includes(norm(room))) {
        score += 30;
        reason = `Name enthält „${room}“`;
      }
      const w = norm(label).split(" ").find((x) => x.length > 3 && norm(name).includes(x));
      if (w) {
        score += 20;
        reason = reason ? `${reason}, Objekt passt` : "Objektname passt";
      }
      if (q && !norm(`${label} ${room ?? ""}`).includes(norm(q))) return;
      all.push({ target, label, room, score, reason });
    };
    project.rooms.forEach((r) => add({ kind: "room", id: r.id }, r.name));
    project.items.forEach((i) => add({ kind: "item", id: i.id }, itemRoom(i, project)?.name ?? null));
    project.openings.forEach((o) => add({ kind: "opening", id: o.id }, project.rooms.find((r) => r.id === o.roomId)?.name ?? null));
    return all.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "de"));
  }, [project, role, area, name, q]);
  return (
    <Dialog open title={`„${name}“ zuordnen`} onClose={onClose} wide>
      <p className="mb-2 text-sm text-ink-2">
        {entityId}
        {area ? ` · Bereich in HA: ${area}` : ""}. Wähle das passende Objekt, Fenster/Tür oder den Raum. Vorschläge werden erst nach deiner Bestätigung übernommen.
      </p>
      <label className="relative mb-3 block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Objekt oder Raum suchen" aria-label="Ziel suchen" />
      </label>
      {!role && <Notice tone="warn">Dieser Gerätetyp wird noch nicht unterstützt.</Notice>}
      <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
        {targets.slice(0, 80).map((t, i) => (
          <li key={`${t.target.kind}:${t.target.id}`} className={clsx("flex items-center gap-2 rounded-2xl border px-3 py-2", i < 2 && t.score >= 30 ? "border-sage/40 bg-sage-soft/40" : "border-line")}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.label}</p>
              <p className="truncate text-xs text-ink-2">
                {t.target.kind === "room" ? "Raum" : t.target.kind === "opening" ? "Fenster/Tür" : "Objekt"}
                {t.room && t.target.kind !== "room" ? ` · ${t.room}` : ""}
                {t.reason ? ` · Vorschlag: ${t.reason}` : ""}
              </p>
            </div>
            <button
              className="btn-secondary min-h-[40px] px-3 text-xs"
              onClick={() => {
                apply((p) => ({ ...p, bindings: [...p.bindings.filter((b) => b.entityId !== entityId), { id: newId("bind"), entityId, target: t.target, role: role!, confirmedAt: new Date().toISOString(), via: t.reason ? "suggestion" : "manual" }] }));
                toast(`${name} → ${t.label} zugeordnet.`, "success");
                onClose();
              }}
            >
              Zuordnen
            </button>
          </li>
        ))}
        {role && targets.length === 0 && <li className="py-4 text-center text-sm text-ink-2">Kein passendes Ziel. Lege im Bereich Gestalten zuerst ein Objekt (z. B. eine Leuchte) an.</li>}
      </ul>
    </Dialog>
  );
}

export function DevicesView() {
  const project = useProject((s) => s.project);
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const states = useLive((s) => s.states);
  const pending = useLive((s) => s.pending);
  const connected = useLive((s) => isConnected(s.status));
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("all");
  const [assign, setAssign] = useState<string | null>(null);
  const [control, setControl] = useState<string | null>(null);
  const hints = useMemo(() => (project ? insights(project, states, connected, pending) : []), [project, states, connected, pending]);
  if (!project) return null;
  const bound = new Set(project.bindings.map((b) => b.entityId));
  const meterSources = new Set(project.meters.flatMap((m) => [m.powerEntityId, m.energyEntityId]).filter(Boolean) as string[]);
  const byRoom = new Map<string, typeof project.bindings>();
  for (const b of project.bindings) {
    const r = roomOfBinding(project, b.target) ?? "";
    byRoom.set(r, [...(byRoom.get(r) ?? []), b]);
  }
  const unassigned = Object.values(states)
    .filter((s) => !bound.has(s.entity_id) && !meterSources.has(s.entity_id))
    .filter((s) => {
      const cap = capabilityOf(s);
      const role = roleForCapability(cap);
      if (!role) return false;
      if (domain !== "all" && role !== domain) return false;
      const n = norm(`${friendlyName(s, "")} ${s.entity_id}`);
      return !q || n.includes(norm(q));
    })
    .sort((a, b) => friendlyName(a, a.entity_id).localeCompare(friendlyName(b, b.entity_id), "de"));
  const controlBinding = control ? project.bindings.find((b) => b.id === control) : null;

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-canvas px-3 pb-32 pt-[calc(5rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <Connection />
          {hints.length > 0 && (
            <section className="panel-flat p-4" aria-label="Hinweise">
              <h2 className="mb-2 text-base font-semibold">Hinweise</h2>
              <ul className="space-y-1.5">
                {hints.map((h) => (
                  <li key={h.key} className="flex items-start gap-2 text-sm">
                    <AlertTriangle size={15} className={clsx("mt-0.5 shrink-0", h.tone === "warn" ? "text-warn" : "text-ink-2")} />
                    {h.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="panel-flat p-4" aria-label="Zugeordnete Geräte" data-testid="bound-devices">
            <h2 className="mb-3 text-base font-semibold">Zugeordnete Geräte ({project.bindings.length})</h2>
            {project.bindings.length === 0 && <p className="text-sm text-ink-2">Noch keine Geräte zugeordnet. Rechts ein Gerät wählen oder im Bereich Gestalten → Verbinden.</p>}
            <div className="space-y-4">
              {[...byRoom.entries()]
                .sort((a, b) => (project.rooms.find((r) => r.id === a[0])?.name ?? "~").localeCompare(project.rooms.find((r) => r.id === b[0])?.name ?? "~", "de"))
                .map(([roomId, list]) => (
                  <div key={roomId}>
                    <h3 className="section-title mb-1">{project.rooms.find((r) => r.id === roomId)?.name ?? "Ohne Raum"}</h3>
                    <ul className="divide-y divide-line rounded-2xl border border-line">
                      {list.map((b) => {
                        const d = describeBinding(b, states, connected);
                        const warn = d.freshness.availability !== "ok";
                        return (
                          <li key={b.id} className="flex items-center gap-2 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{d.name}</p>
                              <p className={clsx("truncate text-xs", warn ? "text-warn" : "text-ink-2")}>
                                {targetLabel(project, b.target).name} · {warn ? d.freshness.reason : stateSummary(d.capability, d.state)}
                              </p>
                            </div>
                            <button className="btn-secondary min-h-[40px] px-3 text-xs" onClick={() => setControl(b.id)}>
                              Steuern
                            </button>
                            {canEdit && (
                              <button className="icon-btn h-10 w-10" aria-label={`Zuordnung von ${d.name} lösen`} onClick={() => apply((p) => ({ ...p, bindings: p.bindings.filter((x) => x.id !== b.id) }))}>
                                <Link2Off size={16} />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
            </div>
          </section>
        </div>
        <section className="panel-flat h-fit p-4" aria-label="Nicht zugeordnete Geräte">
          <h2 className="mb-1 text-base font-semibold">Nicht zugeordnete Geräte</h2>
          <p className="mb-3 text-xs text-ink-2">Aus Home Assistant bzw. der Demo. Steuerungen erscheinen gemäß den tatsächlichen Fähigkeiten.</p>
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen" aria-label="Nicht zugeordnete Geräte durchsuchen" />
          </label>
          <div className="-mx-1 mt-2 flex flex-wrap gap-1.5">
            {DOMAINS.map((d) => (
              <button key={d.id} className={clsx("chip", domain === d.id && "chip-active")} onClick={() => setDomain(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line" data-testid="unassigned">
            {unassigned.slice(0, 150).map((s) => {
              const cap = capabilityOf(s);
              return (
                <li key={s.entity_id} className="flex items-center gap-2 px-3 py-2">
                  <PlugZap size={15} className="shrink-0 text-ink-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{friendlyName(s, s.entity_id)}</p>
                    <p className="truncate text-xs text-ink-2">
                      {s.entity_id} · {domainOf(s.entity_id)} · {stateSummary(cap, s)}
                    </p>
                  </div>
                  {canEdit && (
                    <button className="btn-secondary min-h-[40px] px-3 text-xs" onClick={() => setAssign(s.entity_id)}>
                      <Link2 size={14} /> Zuordnen
                    </button>
                  )}
                </li>
              );
            })}
            {unassigned.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-2">{connected ? "Keine weiteren Geräte." : "Keine Gerätedaten – Verbindung prüfen."}</li>}
          </ul>
          {unassigned.length > 150 && <p className="mt-2 text-xs text-ink-2">{unassigned.length - 150} weitere – Suche verfeinern.</p>}
          {meterSources.size > 0 && <p className="mt-2 text-xs text-ink-2">{meterSources.size} Sensor(en) werden als Messquelle genutzt und sind unter Energie → Messquellen zugeordnet.</p>}
        </section>
      </div>
      {assign && <AssignDialog entityId={assign} onClose={() => setAssign(null)} />}
      {controlBinding && (
        <Dialog open title={targetLabel(project, controlBinding.target).name} onClose={() => setControl(null)}>
          <DeviceControl device={describeBinding(controlBinding, states, connected)} />
        </Dialog>
      )}
    </div>
  );
}

