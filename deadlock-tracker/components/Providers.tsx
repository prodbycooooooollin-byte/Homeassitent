"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_SETTINGS, type AppSettings, type SteamLink } from "@/lib/types";
import { AssetsProvider } from "./GameAssets";
import { openDebrief } from "./DebriefHost";
import type { HeroAgg, MateAgg, MatchListItem, Overview } from "@/lib/view";
import type { ActiveMatchDto } from "@/lib/api";
import { useInterval, useStoredPrimary, type TrackedPlayerDto } from "./useTracker";
import { effectiveAccount, resolvePrimary } from "@/lib/primary";

export interface Status {
  demo: boolean;
  pollIntervalS: number;
  pendingDetails: number;
  coverage?: { total: number; withDetails: number };
  players: TrackedPlayerDto[];
  live: { matchId: number; firstSeenAt: number; accounts: number[] }[];
  detection?: { game: { running: boolean; since: number | null; endedAt: number | null }; gameLog?: { available: boolean; state: string | null; server: string | null; heroes: string[]; map?: string | null; inMatch?: boolean; matchEndedAt: number | null } | null; hints: { matchId: number; source: string; at: number; tries: number; last?: string; done?: string }[]; liveFeed: { checkedAt: number; ok: boolean; fast: boolean } };
}
export interface Toast { id: number; matchId: number; account: number }

interface TrackerCtx {
  status: Status | null;
  /** Aktuell angezeigter Account (standardmäßig der primäre „Ich"-Account). */
  account: number | null;
  /** Der eigene Account – wird beim Start immer gewählt und nie automatisch geändert. */
  primary: number | null;
  /** Wählt vorübergehend einen getrackten Zusatz-Account (nur bis zum Neuladen). */
  setAccount: (id: number | null) => void;
  /** Markiert einen getrackten Account dauerhaft als „Ich". */
  setPrimary: (id: number) => void;
  /** Fügt einen Account zum Tracking hinzu – ändert die Auswahl nie. */
  addPlayer: (input: string) => Promise<string | null>;
  /** Fremdes Profil komplett ansehen (als Gast, ohne dauerhaft zu tracken) */
  viewPlayer: (id: number) => Promise<void>;
  /** Gast dauerhaft tracken */
  keepGuest: (id: number) => Promise<void>;
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
  const [storedPrimary, setStoredPrimary] = useStoredPrimary();
  const [picked, setPicked] = useState<number | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<number> | null>(null);
  const router = useRouter();
  const { settings, steam } = useSettings();
  const primary = status ? resolvePrimary(status.players, storedPrimary, steam?.accountId) : storedPrimary;
  const account = status ? effectiveAccount(status.players, primary, picked) : primary;
  const setAccount = useCallback((id: number | null) => setPicked(id), []);
  const setPrimary = useCallback((id: number) => { setStoredPrimary(id); setPicked(null); }, [setStoredPrimary]);
  // Ersten bzw. Steam-Account als „Ich" festschreiben (ein später hinzugefügter Fremder ändert das nie).
  useEffect(() => { if (primary && primary !== storedPrimary && status) setStoredPrimary(primary); }, [primary, storedPrimary, status, setStoredPrimary]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const acc = Number(q.get("account"));
    if (q.get("steam") === "ok" && acc) { setPrimary(acc); history.replaceState(null, "", window.location.pathname); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => window.desktop?.onNavigate((p) => router.push(p)), [router]);
  // Sofort-Debrief: Die Desktop-Hülle meldet das Match-Ende, sobald Steam die Match-Daten von Valve abgelegt hat
  const debriefed = useRef(new Set<number>());
  const lastAuto = useRef(0);
  useEffect(() => window.desktop?.onMatchEnded?.(({ matchId }) => {
    if (!settings.debrief || !account || debriefed.current.has(matchId) || Date.now() - lastAuto.current < 120_000) return;
    debriefed.current.add(matchId);
    lastAuto.current = Date.now();
    openDebrief({ matchId, account, auto: true });
  }), [settings.debrief, account]);

  const loadStatus = useCallback(async () => {
    try {
      const s: Status = await (await fetch("/api/status")).json();
      setStatus(s);
      // Neue, live erkannte Matches -> Toast (erste Antwort initialisiert nur den Bestand)
      const ids = new Set(s.live.map((l) => l.matchId));
      if (seen.current) {
        for (const l of s.live) {
          if (!seen.current.has(l.matchId)) {
            const acc = l.accounts.includes(account ?? -1) ? account! : l.accounts[0];
            const t: Toast = { id: l.matchId, matchId: l.matchId, account: acc };
            setToasts((cur) => [t, ...cur].slice(0, 3));
            if (settings.debrief && acc === account && !debriefed.current.has(l.matchId)) { debriefed.current.add(l.matchId); openDebrief({ matchId: l.matchId, account: acc }); }
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
  }, [account, settings.notifyNewMatch, settings.debrief]);

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
      await loadStatus();
      return j.sync?.error ? `Hinzugefügt, aber Sync fehlgeschlagen (${j.sync.error}) – es wird automatisch erneut versucht.` : null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [loadStatus]);

  const viewPlayer = useCallback(async (id: number) => {
    const own = status?.players.find((p) => p.accountId === id);
    if (!own) {
      try { await fetch("/api/players", { method: "POST", body: JSON.stringify({ input: String(id), guest: true }) }); } catch { /* unten prüfen */ }
      await loadStatus();
    } else if (own.guest) fetch("/api/players", { method: "POST", body: JSON.stringify({ input: String(id), guest: true }) }).catch(() => {});
    setPicked(id);
    router.push("/");
  }, [status, loadStatus, router]);

  const keepGuest = useCallback(async (id: number) => {
    await fetch("/api/players", { method: "POST", body: JSON.stringify({ input: String(id) }) });
    await loadStatus();
  }, [loadStatus]);

  const removePlayer = useCallback(async (id: number) => {
    await fetch(`/api/players?account=${id}`, { method: "DELETE" });
    const s: Status = await (await fetch("/api/status")).json();
    setStatus(s);
    setPicked(null);
  }, []);

  // Beim Wechsel des Accounts keine Alt-Toasts
  useEffect(() => setToasts([]), [account]);

  return (
    <Ctx.Provider value={{ status, account, primary, setAccount, setPrimary, addPlayer, viewPlayer, keepGuest, removePlayer, syncNow, syncing, toasts, dismissToast: (id) => setToasts((c) => c.filter((t) => t.id !== id)) }}>
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
