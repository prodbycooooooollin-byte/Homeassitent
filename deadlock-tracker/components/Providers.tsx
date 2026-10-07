"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AssetsProvider } from "./GameAssets";
import { useInterval, useSelectedAccount, type TrackedPlayerDto } from "./useTracker";

export interface Status {
  demo: boolean;
  pollIntervalS: number;
  pendingDetails: number;
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
const Ctx = createContext<TrackerCtx>(null as unknown as TrackerCtx);
export const useTracker = () => useContext(Ctx);

function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useSelectedAccount();
  const [status, setStatus] = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<number> | null>(null);

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
            setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), 12000);
          }
        }
      }
      seen.current = new Set([...(seen.current ?? []), ...ids]);
    } catch {
      /* nächster Tick */
    }
  }, [account, setAccount]);

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
  const everyS = Math.max(10, status?.pollIntervalS ?? 20);
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
      <TrackerProvider>{children}</TrackerProvider>
    </AssetsProvider>
  );
}
