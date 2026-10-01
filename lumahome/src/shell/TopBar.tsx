import { clsx } from "clsx";
import { Check, CloudOff, Loader2, Redo2, Settings2, Undo2, Wifi, WifiOff, AlertTriangle, HardDrive, Lock } from "lucide-react";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { useLive } from "@/store/live";
import type { ConnectionStatus } from "@/sources/types";

export function statusLabel(s: ConnectionStatus): { text: string; tone: "ok" | "warn" | "error" | "demo" | "muted" } {
  switch (s.kind) {
    case "demo":
      return { text: "Demo", tone: "demo" };
    case "connecting":
      return { text: "Verbinde …", tone: "muted" };
    case "connected":
      return { text: "Live verbunden", tone: "ok" };
    case "reconnecting":
      return { text: "Getrennt – verbinde neu", tone: "warn" };
    case "server_unreachable":
      return { text: "Server nicht erreichbar", tone: "error" };
    case "not_configured":
      return { text: "Home Assistant nicht eingerichtet", tone: "warn" };
    case "auth_failed":
      return { text: "Anmeldung bei HA fehlgeschlagen", tone: "error" };
    case "forbidden":
      return { text: "PIN erforderlich", tone: "warn" };
  }
}

export function ConnectionPill({ compact }: { compact?: boolean }) {
  const status = useLive((s) => s.status);
  const patch = useUi((s) => s.patch);
  const l = statusLabel(status);
  const Icon = l.tone === "ok" ? Wifi : l.tone === "demo" ? HardDrive : l.tone === "muted" ? Loader2 : WifiOff;
  return (
    <button
      onClick={() => patch({ tab: "devices" })}
      className={clsx(
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
        l.tone === "ok" && "border-sage/30 bg-sage-soft text-sage-dark",
        l.tone === "demo" && "border-energy/30 bg-energy-soft text-energy-dark",
        l.tone === "warn" && "border-warn-line bg-warn-soft text-warn",
        l.tone === "error" && "border-danger-line bg-danger-soft text-danger",
        l.tone === "muted" && "border-line bg-surface text-ink-2",
      )}
      aria-label={`Verbindungsstatus: ${l.text}`}
      data-testid={compact ? "connection-status-compact" : "connection-status"}
    >
      <Icon size={14} className={l.tone === "muted" ? "spin" : undefined} />
      {!compact && <span>{l.text}</span>}
    </button>
  );
}

export function SaveIndicator() {
  const { saveStatus, mode, saveError } = useProject();
  const map = {
    saved: { icon: Check, text: mode === "demo" ? "Im Browser gespeichert" : "Gespeichert", cls: "text-ink-2" },
    dirty: { icon: Loader2, text: "Änderungen …", cls: "text-ink-2" },
    saving: { icon: Loader2, text: "Speichert …", cls: "text-ink-2" },
    error: { icon: CloudOff, text: "Nicht gespeichert – erneuter Versuch", cls: "text-danger" },
    conflict: { icon: AlertTriangle, text: "Konflikt", cls: "text-warn" },
    readonly: { icon: Lock, text: "Nur ansehen", cls: "text-ink-2" },
    local: { icon: HardDrive, text: "Lokal", cls: "text-ink-2" },
  } as const;
  const m = map[saveStatus];
  return (
    <span className={clsx("inline-flex items-center gap-1 text-xs", m.cls)} title={saveError ?? undefined} data-testid="save-status" data-status={saveStatus}>
      <m.icon size={13} className={saveStatus === "saving" || saveStatus === "dirty" ? "spin" : undefined} />
      <span className="hidden sm:inline">{m.text}</span>
    </span>
  );
}

export function FloorPicker() {
  const project = useProject((s) => s.project);
  const floorId = useUi((s) => s.floorId);
  const patch = useUi((s) => s.patch);
  if (!project || project.floors.length < 2) return null;
  const floors = [...project.floors].sort((a, b) => b.elevation - a.elevation);
  return (
    <div role="radiogroup" aria-label="Etage" className="inline-flex rounded-full border border-line bg-surface p-0.5 shadow-soft">
      {floors.map((f) => (
        <button
          key={f.id}
          role="radio"
          aria-checked={f.id === floorId}
          title={f.name}
          onClick={() => patch({ floorId: f.id, selection: null, card: null })}
          className={clsx("min-h-[36px] min-w-[44px] rounded-full px-3 text-xs font-semibold", f.id === floorId ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}
        >
          {shortName(f.name)}
        </button>
      ))}
    </div>
  );
}

function shortName(n: string) {
  const known: Record<string, string> = { Erdgeschoss: "EG", Obergeschoss: "OG", Dachgeschoss: "DG", Keller: "KG", Untergeschoss: "UG" };
  return known[n] ?? (n.length > 6 ? n.slice(0, 5) + "…" : n);
}

export function TopBar() {
  const project = useProject((s) => s.project);
  const mode = useProject((s) => s.mode);
  const { undo, redo, past, future, canEdit } = useProject();
  const tab = useUi((s) => s.tab);
  const patch = useUi((s) => s.patch);
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 px-3 pt-[calc(0.6rem+env(safe-area-inset-top))] sm:px-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl border border-line/70 bg-surface/95 py-1 pl-3 pr-1 shadow-soft backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight" data-testid="house-name">
            {project?.name ?? "LumaHome"}
          </p>
          <div className="flex items-center gap-2">
            {mode === "demo" && <span className="badge bg-energy-soft px-1.5 py-0 text-[10px] uppercase tracking-wide text-energy-dark">Demo</span>}
            <SaveIndicator />
          </div>
        </div>
        <button className="icon-btn" aria-label="Einstellungen und Projekt" onClick={() => patch({ settingsOpen: true })}>
          <Settings2 size={18} />
        </button>
      </div>
      <div className="pointer-events-auto flex items-center gap-2">
        {tab === "design" && canEdit && (
          <div className="hidden items-center rounded-2xl border border-line/70 bg-surface/95 p-0.5 shadow-soft sm:flex">
            <button className="icon-btn" aria-label="Rückgängig" onClick={undo} disabled={!past.length} title="Rückgängig (Strg+Z)">
              <Undo2 size={18} />
            </button>
            <button className="icon-btn" aria-label="Wiederholen" onClick={redo} disabled={!future.length} title="Wiederholen (Strg+Umschalt+Z)">
              <Redo2 size={18} />
            </button>
          </div>
        )}
        <FloorPicker />
        <span className="hidden sm:inline-flex">
          <ConnectionPill />
        </span>
        <span className="sm:hidden">
          <ConnectionPill compact />
        </span>
      </div>
    </header>
  );
}
