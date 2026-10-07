"use client";
import { useCallback, useState } from "react";
import { GradeBadge } from "./GradeBadge";
import { RankBadge } from "./RankBadge";
import { useInterval, useSelectedAccount, type TrackedPlayerDto } from "./useTracker";
import { fmtAgo, fmtDuration } from "@/lib/format";
import type { Grade } from "@/lib/types";
import type { MatchListItem, Overview } from "@/lib/view";

interface Status {
  demo: boolean;
  pollIntervalS: number;
  pendingDetails: number;
  players: TrackedPlayerDto[];
}
interface MatchesRes {
  matches: MatchListItem[];
  overview: Overview;
  heroes: Record<number, { name: string }>;
}

const GRADES: Grade[] = ["S", "A", "B", "C", "D", "F"];

export function Dashboard() {
  const [account, setAccount] = useSelectedAccount();
  const [status, setStatus] = useState<Status | null>(null);
  const [data, setData] = useState<MatchesRes | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<number[]>([]);
  const [lastKnown, setLastKnown] = useState<Set<number> | null>(null);

  const load = useCallback(async () => {
    try {
      const s: Status = await (await fetch("/api/status")).json();
      setStatus(s);
      const acc = account ?? s.players[0]?.accountId ?? null;
      if (acc && acc !== account) setAccount(acc);
      if (!acc) return;
      const d: MatchesRes = await (await fetch(`/api/matches?account=${acc}`)).json();
      setData(d);
      setLastKnown((prev) => {
        const ids = new Set(d.matches.map((m) => m.matchId));
        if (prev) {
          const added = [...ids].filter((i) => !prev.has(i));
          if (added.length) setFresh((f) => [...added, ...f]);
        }
        return ids;
      });
    } catch {
      /* temporärer Fehler – nächster Tick versucht es erneut */
    }
  }, [account, setAccount]);

  // UI aktualisieren (günstig, liest nur den Server-Store) …
  useInterval(load, 5000);
  // … und zusätzlich einen Sync anstoßen, falls kein Server-Poller läuft (z. B. Serverless). Dedupliziert serverseitig.
  useInterval(() => {
    if (account) fetch("/api/sync", { method: "POST" }).catch(() => {});
  }, Math.max(10, status?.pollIntervalS ?? 20) * 1000);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/players", { method: "POST", body: JSON.stringify({ input }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Fehler");
      if (j.sync?.error) setError(`Spieler hinzugefügt, aber Sync fehlgeschlagen: ${j.sync.error} – es wird automatisch erneut versucht.`);
      setAccount(j.player.accountId);
      setInput("");
      setLastKnown(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const me = status?.players.find((p) => p.accountId === account);
  const hero = (id: number) => data?.heroes[id]?.name ?? `Held #${id}`;

  if (status && !status.players.length) {
    return (
      <div className="card mx-auto max-w-lg p-6">
        <h1 className="mb-1 text-xl font-bold">Account verbinden</h1>
        <p className="mb-4 text-sm text-muted">
          Gib deine Steam-Account-ID (Steam32 oder Steam64) oder deinen <code>steamcommunity.com/profiles/…</code>-Link ein.
          {status.demo && " (Demo-Modus aktiv – jede Zahl funktioniert.)"}
        </p>
        <form onSubmit={add} className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="z. B. 76561198012345678"
            className="flex-1 rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-amber" />
          <button disabled={busy || !input} className="rounded-lg bg-amber px-4 py-2 font-semibold text-black disabled:opacity-50">
            {busy ? "…" : "Tracken"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-loss">{error}</p>}
      </div>
    );
  }

  const ov = data?.overview;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{me?.name ?? "…"}</h1>
          <p className="text-xs text-muted">
            ID {account} ·{" "}
            {me?.lastSyncAt ? (
              <span className={me.lastSyncOk ? "text-win" : "text-loss"}>
                ● {me.lastSyncOk ? "live" : `Sync-Fehler (${me.lastError})`} · zuletzt {fmtAgo(me.lastSyncAt / 1000)}
              </span>
            ) : "noch nicht synchronisiert"}
            {status && status.pendingDetails > 0 && ` · ${status.pendingDetails} Match(es) warten auf Details`}
            {status?.demo && " · DEMO"}
          </p>
        </div>
        <form onSubmit={add} className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Weiteren Account tracken"
            className="w-56 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm outline-none focus:border-amber" />
          <button disabled={busy || !input} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-amber disabled:opacity-50">+</button>
        </form>
        {status && status.players.length > 1 && (
          <select value={account ?? ""} onChange={(e) => { setAccount(Number(e.target.value)); setData(null); setLastKnown(null); }}
            className="rounded-lg border border-line bg-panel px-2 py-1.5 text-sm">
            {status.players.map((p) => <option key={p.accountId} value={p.accountId}>{p.name}</option>)}
          </select>
        )}
      </div>
      {error && <p className="text-sm text-loss">{error}</p>}

      {fresh.length > 0 && (
        <div className="card flex items-center justify-between border-amber/60 p-3 text-sm">
          <span>🆕 {fresh.length} neues Match erkannt: {fresh.slice(0, 3).map((id) => (
            <a key={id} href={`/match/${id}?account=${account}`} className="ml-2 text-amber underline">#{id}</a>
          ))}</span>
          <button onClick={() => setFresh([])} className="text-muted hover:text-white">✕</button>
        </div>
      )}

      {ov && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Matches" value={String(ov.matches)} />
          <Stat label="Winrate" value={`${Math.round(ov.winrate * 100)}%`} sub={`${ov.wins}W – ${ov.matches - ov.wins}L`} />
          <Stat label="KDA" value={ov.kda.toFixed(2)} />
          <Stat label="Ø Rating" value={ov.avgScore === null ? "–" : ov.avgScore.toFixed(2)} sub="1.00 = Lobby-Schnitt" />
          <div className="card p-3">
            <div className="text-xs text-muted">Noten</div>
            <div className="mt-1 flex gap-1.5">
              {GRADES.map((g) => (
                <div key={g} className="text-center">
                  <GradeBadge grade={g} size="sm" />
                  <div className="num mt-0.5 text-xs text-muted">{ov.gradeCounts[g]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {ov && ov.heroes.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">Meistgespielte Helden</h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
            {ov.heroes.map((h) => (
              <div key={h.heroId} className="rounded-lg bg-panel2 p-2 text-sm">
                <div className="truncate font-medium">{hero(h.heroId)}</div>
                <div className="num text-xs text-muted">{h.matches} Spiele · {Math.round((h.wins / h.matches) * 100)}% · KDA {h.kda.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card divide-y divide-line">
        {!data && <div className="p-6 text-center text-muted">Lade Matches …</div>}
        {data && data.matches.length === 0 && <div className="p-6 text-center text-muted">Noch keine Matches gefunden.</div>}
        {data?.matches.slice(0, 100).map((m) => (
          <a key={m.matchId} href={`/match/${m.matchId}?account=${account}`}
            className={`flex items-center gap-3 border-l-4 px-3 py-2.5 hover:bg-panel2 ${m.won ? "border-win" : "border-loss"} ${fresh.includes(m.matchId) ? "bg-amber/5" : ""}`}>
            <GradeBadge grade={m.grade} />
            <div className="w-36 min-w-0">
              <div className="truncate font-medium">{hero(m.heroId)}</div>
              <div className={`text-xs ${m.won ? "text-win" : "text-loss"}`}>{m.won ? "Sieg" : "Niederlage"} · {fmtDuration(m.durationS)}</div>
            </div>
            <div className="num w-24 text-sm">{m.kills} / {m.deaths} / {m.assists}</div>
            <div className="hidden w-24 text-sm sm:block"><RankBadge badge={m.lobbyBadge} /></div>
            <div className="ml-auto text-right text-xs text-muted">
              {fmtAgo(m.startTime + m.durationS)}
              {m.detectedAfterS !== null && <div title="Zeit zwischen Spielende und Erkennung">⚡ erkannt nach {m.detectedAfterS}s</div>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="num text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
