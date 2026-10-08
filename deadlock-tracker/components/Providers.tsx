"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_SETTINGS, type AppSettings, type SteamLink } from "@/lib/types";
import { AssetsProvider } from "./GameAssets";
import type { HeroAgg, MateAgg, MatchListItem, Overview } from "@/lib/view";
import type { ActiveMatchDto } from "@/lib/api";
import { useInterval, useSelectedAccount, type TrackedPlayerDto } from "./useTracker";

export interface Status {
  demo: boolean;
  pollIntervalS: number;
  pendingDetails: number;
  coverage?: { total: number; withDetails: number };
  players: TrackedPlayerDto[];
  live: { matchId: number; firstSeenAt: number; accounts: number[] }[];
}
export interface Toast { id: number; matchId: number; account: number }

interface TrackerCtx {
  status: Status | null;
  account: number | null;
  setAccount: (id: number | null) => void;
  addPlayer: (input: string) => Promise<string | null>;
  removePlayer: (id: number) => Promise<void>;
  syncNow: () => Promise<void>;
  syncing: boolean;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}
/* ---- Einstellungen (serverseitig gespeichert, hier als Kontext + Klassen auf <html>) ---- */
interface SettingsCtx { settings: AppSettings; steam: SteamLink | null; update: (patch: Partial<AppSettings>) => Promise<void>; disconnectSteam: () => Promise<void> }
const SCtx = createContext<SettingsCtx>({ settings: DEFAULT_SETTINGS, steam: null, update: async () => {}, disconnectSteam: async () => {} });
export const useSettings = () => useContext(SCtx);

function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [steam, setSteam] = useState<SteamLink | null>(null);
  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then((j) => { setSettings(j.settings); setSteam(j.steam); }).catch(() => {}); }, []);
  useEffect(() => {
    const c = document.documentElement.classList;
    c.toggle("fx-reduced", settings.effects === "reduced");
    c.toggle("fx-off", settings.effects === "off");
    c.toggle("density-compact", settings.density === "compact");
  }, [settings]);
  const update = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((s) => ({ ...s, ...patch })); // optimistisch
    try { setSettings((await (await fetch("/api/settings", { method: "PUT", body: JSON.stringify({ settings: patch }) })).json()).settings); } catch { /* bleibt optimistisch */ }
  }, []);
  const disconnectSteam = useCallback(async () => {
    const j = await (await fetch("/api/settings", { method: "PUT", body: JSON.stringify({ disconnectSteam: true }) })).json();
    setSettings(j.settings); setSteam(j.steam);
  }, []);
  return <SCtx.Provider value={{ settings, steam, update, disconnectSteam }}>{children}</SCtx.Provider>;
}

const Ctx = createContext<TrackerCtx>(null as unknown as TrackerCtx);
export const useTracker = () => useContext(Ctx);

export interface ProfileData { matches: MatchListItem[]; overview: Overview; heroes: HeroAgg[]; mates: MateAgg[] }
interface DataCtx { data: ProfileData | null; live: ActiveMatchDto | null; loading: boolean }
const DCtx = createContext<DataCtx>({ data: null, live: null, loading: true });
/** Profildaten des gewählten Accounts – seitenübergreifend gecacht, damit Navigation nie „leer" aufblitzt. */
export const useData = () => useContext(DCtx);

function DataProvider({ children }: { children: React.ReactNode }) {
  const { account } = useTracker();
  const cache = useRef(new Map<number, ProfileData>());
  const [data, setData] = useState<ProfileData | null>(null);
  const [live, setLive] = useState<ActiveMatchDto | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!account) return;
    try {
      const d: ProfileData = await (await fetch(`/api/matches?account=${account}`)).json();
      if (Array.isArray(d.matches)) { cache.current.set(account, d); setData(d); }
    } catch { /* nächster Tick */ }
    setLoading(false);
  }, [account]);
  const loadLive = useCallback(async () => {
    if (!account) return;
    try { setLive((await (await fetch(`/api/live?account=${account}`)).json()).match ?? null); } catch { /* ignorieren */ }
  }, [account]);

  useEffect(() => { setData(account ? cache.current.get(account) ?? null : null); setLive(null); setLoading(!account || !cache.current.has(account)); }, [account]);
  useEffect(() => { load(); loadLive(); }, [load, loadLive]);
  useInterval(load, 5000);
  useInterval(loadLive, 6000);
  return <DCtx.Provider value={{ data, live, loading }}>{children}</DCtx.Provider>;
}

function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useSelectedAccount();
  const [status, setStatus] = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<number> | null>(null);
  const router = useRouter();
  const { settings } = useSettings();
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const acc = Number(q.get("account"));
    if (q.get("steam") === "ok" && acc) { setAccount(acc); history.replaceState(null, "", window.location.pathname); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => window.desktop?.onNavigate((p) => router.push(p)), [router]);

  const loadStatus = useCallback(async () => {
    try {
      const s: Status = await (await fetch("/api/status")).json();
      setStatus(s);
      if (account === null && s.players[0]) setAccount(s.players[0].accountId);
      // Neue, live erkannte Matches -> Toast (erste Antwort initialisiert nur den Bestand)
      const ids = new Set(s.live.map((l) => l.matchId));
      if (seen.current) {
        for (const l of s.live) {
          if (!seen.current.has(l.matchId)) {
            const acc = l.accounts.includes(account ?? -1) ? account! : l.accounts[0];
            const t: Toast = { id: l.matchId, matchId: l.matchId, account: acc };
            setToasts((cur) => [t, ...cur].slice(0, 3));
            if (settings.notifyNewMatch) {
              const n = { title: "Neues Match erkannt", body: `Match #${l.matchId} wurde angelegt.`, path: `/match/${l.matchId}?account=${acc}` };
              if (window.desktop) window.desktop.notify(n); else if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(n.title, { body: n.body });
            }
            setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), 12000);
          }
        }
      }
      seen.current = new Set([...(seen.current ?? []), ...ids]);
    } catch {
      /* nächster Tick */
    }
  }, [account, setAccount, settings.notifyNewMatch]);

  useInterval(loadStatus, 4000);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      await loadStatus();
    } finally {
      setSyncing(false);
    }
  }, [loadStatus]);

  // Zusätzlicher Client-Sync (dedupliziert serverseitig) – falls kein Server-Poller läuft.
  const everyS = Math.max(10, settings.pollIntervalS);
  useInterval(() => {
    if (status?.players.length) fetch("/api/sync", { method: "POST" }).catch(() => {});
  }, everyS * 1000);

  const addPlayer = useCallback(async (input: string) => {
    try {
      const res = await fetch("/api/players", { method: "POST", body: JSON.stringify({ input }) });
      const j = await res.json();
      if (!res.ok) return j.error ?? "Fehler";
      setAccount(j.player.accountId);
      await loadStatus();
      return j.sync?.error ? `Hinzugefügt, aber Sync fehlgeschlagen (${j.sync.error}) – es wird automatisch erneut versucht.` : null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [loadStatus, setAccount]);

  const removePlayer = useCallback(async (id: number) => {
    await fetch(`/api/players?account=${id}`, { method: "DELETE" });
    const s: Status = await (await fetch("/api/status")).json();
    setStatus(s);
    setAccount(s.players[0]?.accountId ?? null);
  }, [setAccount]);

  // Beim Wechsel des Accounts keine Alt-Toasts
  useEffect(() => setToasts([]), [account]);

  return (
    <Ctx.Provider value={{ status, account, setAccount, addPlayer, removePlayer, syncNow, syncing, toasts, dismissToast: (id) => setToasts((c) => c.filter((t) => t.id !== id)) }}>
      {children}
    </Ctx.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AssetsProvider>
      <SettingsProvider><TrackerProvider><DataProvider>{children}</DataProvider></TrackerProvider></SettingsProvider>
    </AssetsProvider>
  );
}
