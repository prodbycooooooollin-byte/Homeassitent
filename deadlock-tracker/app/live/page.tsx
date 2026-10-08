"use client";
import { useCallback, useEffect, useState } from "react";
import { Empty, Gate } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ScoutBoard, ScoutCard, type LiveMatchMeta } from "@/components/ScoutBoard";
import { useInterval } from "@/components/useTracker";
import type { ScoutPlayer } from "@/lib/live";
import type { ScoutResult } from "@/lib/scout";

type Mode = "live" | "last" | "player";
interface Res extends Partial<ScoutResult> { kind: Mode; active?: boolean; available?: boolean; match?: LiveMatchMeta; error?: string }
interface Hit { accountId: number; name: string; avatar?: string; matches30d?: number }

export default function LivePage() {
  return <Gate>{({ me }) => <View account={me.accountId} />}</Gate>;
}

function View({ account }: { account: number }) {
  const [mode, setMode] = useState<Mode>("live");
  const [res, setRes] = useState<Res | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoPicked, setAutoPicked] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [target, setTarget] = useState<number | null>(null);

  const load = useCallback(async () => {
    const url = mode === "player" ? (target ? `/api/scout?mode=player&id=${target}` : null) : `/api/scout?mode=${mode}&account=${account}`;
    if (!url) { setRes(null); setLoading(false); return; }
    try { setRes(await (await fetch(url)).json()); } catch { setRes({ kind: mode, error: "Nicht erreichbar" }); }
    setLoading(false);
  }, [mode, account, target]);
  useEffect(() => { setLoading(true); setRes(null); load(); }, [load]);
  useInterval(() => { if (mode === "live") load(); }, 8000);
  // Läuft kein Match, springt die Seite einmalig auf das letzte Match
  useEffect(() => { if (mode === "live" && res && res.active === false && !autoPicked) { setAutoPicked(true); setMode("last"); } }, [mode, res, autoPicked]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => { try { setHits((await (await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)).json()).results ?? []); } catch { setHits([]); } }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const isLive = mode === "live" && res?.active;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="display text-lg font-extrabold tracking-tight">Live & Scouting</h1>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
          {([["live", "Live-Match"], ["last", "Letztes Match"], ["player", "Spieler scouten"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={`tab flex items-center gap-1.5 !py-1 ${mode === k ? "tab-active" : ""}`}>{k === "live" && <span className={res?.kind === "live" && res.active ? "live-pulse !h-2 !w-2" : "h-2 w-2 rounded-full bg-white/20"} />}{l}</button>
          ))}
        </div>
      </div>

      {mode === "player" && (
        <section className="surface p-5">
          <div className="relative max-w-lg"><Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => { setQ(e.target.value); const n = Number(e.target.value.trim()); if (/^\d{5,}$/.test(e.target.value.trim()) && n) setTarget(n); }} placeholder="Spielername oder Steam-ID …" className="input !rounded-full pl-9" /></div>
          {hits.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{hits.map((h) => (
            <button key={h.accountId} onClick={() => { setTarget(h.accountId); setHits([]); setQ(h.name); }} className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] p-2 text-left transition hover:border-amber/50">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{h.name}</span><span className="text-[11px] text-muted">{h.matches30d !== undefined ? `${h.matches30d} Matches (30 Tage)` : `ID ${h.accountId}`}</span></span><Icon name="chevron" size={14} className="text-muted" /></button>))}</div>}
          <p className="mt-2 text-xs text-muted">Zeigt Rang, Erfahrung, Lieblingshelden, Form und Spielstil eines beliebigen Spielers – praktisch, um jemanden aus der Lobby kurz einzuschätzen.</p>
        </section>
      )}

      {loading && mode !== "player" && <><div className="skeleton h-40" /><div className="skeleton h-96" /></>}
      {res?.error && <div className="surface p-5 text-loss">{res.error}</div>}

      {mode === "live" && res && res.active === false && !loading && <NoLive onLast={() => setMode("last")} />}
      {mode === "last" && res && res.available === false && <Empty icon="eye" title="Noch kein Match mit Details" text="Sobald das erste Match mit vollständigen Details geladen ist, kannst du hier die Lobby nachträglich ansehen." />}

      {res?.players && (mode === "live" ? res.active : mode === "last" ? res.available : true) && (
        <>
          {mode === "player" ? (
            <div className="max-w-xl">{(res.players as ScoutPlayer[]).map((p) => <ScoutCard key={p.accountId} p={p} />)}</div>
          ) : (
            <ScoutBoard r={res as ScoutResult} match={res.match} live={!!isLive} />
          )}
        </>
      )}
      {mode === "player" && !target && <Empty icon="search" title="Spieler suchen" text="Gib einen Namen oder eine Steam-ID ein, um Rang, Erfahrung und Spielstil zu sehen." />}
    </div>
  );
}

function NoLive({ onLast }: { onLast: () => void }) {
  return (
    <section className="surface p-8 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]"><Icon name="eye" size={26} className="text-muted" /></div>
      <h2 className="display text-xl font-bold">Gerade läuft kein Match</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted">Live-Daten stammen aus dem Zuschauer-Tab des Spiels, der nur die <b className="text-white">Top-200-Matches</b> zeigt. Läuft dein Match dort nicht, erscheint es hier leider nicht. Du kannst stattdessen die Lobby deines letzten Matches ansehen oder einzelne Spieler gezielt scouten.</p>
      <div className="mt-4 flex justify-center gap-2"><button onClick={onLast} className="btn btn-gold">Letztes Match scouten</button></div>
    </section>
  );
}
