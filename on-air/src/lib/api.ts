// Brücke zur Rust-Seite. Außerhalb von Tauri (Browser-Vorschau) wird ein
// klar gekennzeichnetes Beispiel-Backend geladen – nie im Desktop-Build aktiv.

import type {
  AppSnapshot,
  BlockEntry,
  Check,
  CmdError,
  Device,
  DeviceCode,
  HistoryEntry,
  Settings,
  SubmitOutcome,
  Track,
} from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface Backend {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  onSnapshot(cb: (s: AppSnapshot) => void): () => void;
  onCloseRequested(cb: () => void): () => void;
  isPreview: boolean;
}

let backend: Promise<Backend> | null = null;

function load(): Promise<Backend> {
  if (backend) return backend;
  backend = (async () => {
    if (isTauri) {
      const core = await import("@tauri-apps/api/core");
      const ev = await import("@tauri-apps/api/event");
      const listen = (name: string, cb: (payload: unknown) => void) => {
        let un: (() => void) | undefined;
        let dead = false;
        ev.listen(name, (e) => cb(e.payload)).then((u) => (dead ? u() : (un = u)));
        return () => {
          dead = true;
          un?.();
        };
      };
      return {
        isPreview: false,
        invoke: <T,>(cmd: string, args?: Record<string, unknown>) => core.invoke<T>(cmd, args),
        onSnapshot: (cb) => listen("onair://snapshot", (p) => cb(p as AppSnapshot)),
        onCloseRequested: (cb) => listen("onair://close-requested", () => cb()),
      } satisfies Backend;
    }
    const mock = await import("./mock");
    return mock.createMockBackend();
  })();
  return backend;
}

export async function isPreviewBackend(): Promise<boolean> {
  return (await load()).isPreview;
}

export function toCmdError(e: unknown): CmdError {
  if (e && typeof e === "object" && "code" in e && "message" in e) return e as CmdError;
  return { code: "error", message: String(e) };
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const b = await load();
  try {
    return await b.invoke<T>(cmd, args);
  } catch (e) {
    throw toCmdError(e);
  }
}

export const api = {
  snapshot: () => call<AppSnapshot>("get_snapshot"),
  onSnapshot: async (cb: (s: AppSnapshot) => void) => (await load()).onSnapshot(cb),
  onCloseRequested: async (cb: () => void) => (await load()).onCloseRequested(cb),

  spotifyLogin: () => call<void>("spotify_login"),
  spotifyCancelLogin: () => call<void>("spotify_cancel_login"),
  spotifyLogout: () => call<void>("spotify_logout"),
  twitchLoginStart: () => call<DeviceCode>("twitch_login_start"),
  twitchLoginCancel: () => call<void>("twitch_login_cancel"),
  twitchLogout: () => call<void>("twitch_logout"),

  transport: (action: "next" | "previous" | "pause" | "resume") => call<void>("transport", { action }),
  devices: () => call<Device[]>("list_devices"),
  transfer: (deviceId: string) => call<void>("transfer_playback", { deviceId }),
  search: (query: string) => call<Track[]>("search", { query }),
  addRequest: (track: Track) => call<SubmitOutcome>("add_request", { track }),
  queueAction: (action: string, id: string, index?: number) => call<void>("queue_action", { action, id, index }),
  setRequestsOpen: (open: boolean) => call<void>("set_requests_open", { open }),

  updateSettings: (settings: Settings) => call<Settings>("update_settings", { settings }),
  exportSettings: () => call<string>("export_settings"),
  importSettings: (raw: string) => call<Settings>("import_settings", { raw }),
  profile: (action: "save" | "apply" | "update" | "delete", opts: { id?: string; name?: string }) =>
    call<void>("profile_action", { action, ...opts }),

  blocklist: () => call<BlockEntry[]>("blocklist_list"),
  blockAdd: (kind: string, value: string, label: string) => call<void>("blocklist_add", { kind, value, label }),
  blockRemove: (kind: string, value: string) => call<void>("blocklist_remove", { kind, value }),
  history: (search: string, limit = 200) => call<HistoryEntry[]>("history", { search, limit }),

  diagnostics: (target: "spotify" | "twitch" | "overlay" | "all") => call<Check[]>("run_diagnostics", { target }),
  diagnosticsExport: () => call<unknown>("diagnostics_export"),
  writeExportFile: (path: string, content: string) => call<void>("write_export_file", { path, content }),
  readImportFile: (path: string) => call<string>("read_import_file", { path }),
  openExternal: (url: string) => call<void>("open_external", { url }),
  openLogsFolder: () => call<void>("open_logs_folder"),
  controlToken: () => call<string>("get_control_token"),
  setUiVisible: (visible: boolean) => call<void>("set_ui_visible", { visible }),
  openCompact: () => call<void>("open_compact"),
  closeAction: (action: "tray" | "quit", remember: boolean) => call<void>("close_action", { action, remember }),
  quit: () => call<void>("quit_app"),
};

/** Speichern-Dialog (Tauri) bzw. Download (Browser-Vorschau). */
export async function saveTextFile(defaultName: string, content: string): Promise<boolean> {
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const ext = defaultName.split(".").pop() ?? "json";
    const path = await save({ defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return false;
    await api.writeExportFile(path, content);
    return true;
  }
  const blob = new Blob([content], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

export async function openTextFile(): Promise<string | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path || Array.isArray(path)) return null;
    return api.readImportFile(path);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : null);
    input.click();
  });
}

export async function pickNowPlayingPath(): Promise<string | null> {
  if (!isTauri) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return (await save({ defaultPath: "nowplaying.txt", filters: [{ name: "Text", extensions: ["txt"] }] })) ?? null;
}

export async function autostart(): Promise<{ supported: boolean; enabled: boolean; set(v: boolean): Promise<void> }> {
  if (!isTauri) return { supported: false, enabled: false, set: async () => {} };
  const a = await import("@tauri-apps/plugin-autostart");
  return {
    supported: true,
    enabled: await a.isEnabled(),
    set: async (v: boolean) => (v ? a.enable() : a.disable()),
  };
}

export async function showMainWindow() {
  if (!isTauri) return;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const w = await WebviewWindow.getByLabel("main");
  await w?.show();
  await w?.unminimize();
  await w?.setFocus();
  await api.setUiVisible(true);
}

export async function setAlwaysOnTop(v: boolean) {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setAlwaysOnTop(v);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
