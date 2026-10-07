"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, HeroBackdrop, HeroPortrait, RankEmblem, useHero, useHeroName } from "./GameAssets";
import { GradeBadge, GRADE_STYLE } from "./GradeBadge";
import { FormDots, Sparkline, WinRing, useCountUp } from "./charts";
import { LogoMark } from "./Logo";
import { useInterval } from "./useTracker";
import { useTracker } from "./Providers";
import { fmtAgo, fmtDuration, fmtK } from "@/lib/format";
import { formatBadge } from "@/lib/ranks";
import type { Grade } from "@/lib/types";
import type { MatchListItem, Overview } from "@/lib/view";

interface MatchesRes { matches: MatchListItem[]; overview: Overview }
const GRADES: Grade[] = ["S", "A", "B", "C", "D", "F"];

export function Dashboard() {
  const { status, account, addPlayer, removePlayer } = useTracker();
  const [data, setData] = useState<MatchesRes | null>(null);

  const load = useCallback(async () => {
    if (!account) return;
    try {
      setData(await (await fetch(`/api/matches?account=${account}`)).json());
    } catch { /* nächster Tick */ }
  }, [account]);
  useEffect(() => { setData(null); load(); }, [account, load]);
  useInterval(load, 5000);

  const [adding, setAdding] = useState(false);
  useEffect(() => setAdding(new URLSearchParams(location.search).has("add")), []);

  if (!status) return <Skeleton />;
  if (!status.players.length || adding) {
    return <Onboarding demo={status.demo} first={!status.players.length} onSubmit={addPlayer} onDone={() => { setAdding(false); history.replaceState(null, "", "/"); }} />;
  }
  const me = status.players.find((p) => p.accountId === account);
  if (!me) return <Skeleton />;
  return (
    <div className="space-y-5">
      <PlayerCard name={me.name} avatar={me.avatar} accountId={me.accountId} ov={data?.overview} onRemove={() => confirm(`${me.name} nicht mehr tracken?`) && removePlayer(me.accountId)} />
      {me.lastSyncOk === false && (
        <div className="surface border-loss/40 p-3 text-sm text-loss">Sync-Fehler: {me.lastError}. Der Tracker versucht es automatisch erneut – bereits erkannte Matches bleiben erhalten.</div>
      )}
      <StatStrip ov={data?.overview} />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <MatchList matches={data?.matches} account={me.accountId} pending={status.pendingDetails} />
        <Sidebar ov={data?.overview} />
      </div>
    </div>
  );
}

/* ---------- Player Card (Header) ---------- */
function PlayerCard({ name, avatar, accountId, ov, onRemove }: { name: string; avatar?: string; accountId: number; ov?: Overview; onRemove: () => void }) {
  const topHeroId = ov?.heroes[0]?.heroId;
  const { name: heroName, color } = useHero(topHeroId);
  return (
    <section className="surface fade-up overflow-hidden" style={{ boxShadow: `0 0 0 1px ${color}33, 0 30px 60px -30px ${color}55` }}>
      <HeroBackdrop id={topHeroId} />
      <div className="relative grid items-center gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:p-8">
        <div className="relative">
          {topHeroId ? <HeroPortrait id={topHeroId} size={148} variant="portrait" className="!rounded-2xl" ring={color} /> : <div className="skeleton h-[148px] w-[148px]" />}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/70 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
            {topHeroId ? `Main · ${heroName}` : "…"}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <Avatar src={avatar} name={name} size={64} ring={color} />
            <div className="min-w-0">
              <h1 className="display truncate text-4xl font-extrabold tracking-tight">{name}</h1>
              <p className="text-xs text-muted">Account {accountId} · <button onClick={onRemove} className="underline-offset-2 hover:text-loss hover:underline">entfernen</button></p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 py-1.5 pl-2 pr-4">
              <RankEmblem badge={ov?.currentBadge} size={44} />
              <div>
                <div className="label">Rang</div>
                <div className="display text-lg font-bold leading-tight">{ov?.currentBadge ? formatBadge(ov.currentBadge) : "Unbekannt"}</div>
              </div>
            </div>
            {ov && ov.heroes.slice(1, 4).map((h) => (
              <div key={h.heroId} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-1.5 pr-3">
                <HeroPortrait id={h.heroId} size={36} variant="small" />
                <div className="num text-xs"><div className="font-semibold">{Math.round((h.wins / h.matches) * 100)}% WR</div><div className="text-muted">{h.matches} Spiele</div></div>
              </div>
            ))}
          </div>
        </div>
        {ov ? <WinRing value={ov.winrate} wins={ov.wins} losses={ov.matches - ov.wins} size={120} /> : <div className="skeleton h-[120px] w-[120px] rounded-full" />}
      </div>
    </section>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="surface surface-hover p-4">
      <div className="label">{label}</div>
      <div className="display num mt-1 text-3xl font-extrabold" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function StatStrip({ ov }: { ov?: Overview }) {
  const kda = useCountUp(ov?.kda ?? 0);
  const score = useCountUp(ov?.avgScore ?? 0);
  const matches = useCountUp(ov?.matches ?? 0);
  if (!ov) return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[92px]" />)}</div>;
  const avgGrade = ov.avgScore === null ? null : gradeOf(ov.avgScore);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Matches" value={String(Math.round(matches))} sub={`${ov.wins} Siege · ${ov.matches - ov.wins} Niederlagen`} />
      <Tile label="KDA" value={kda.toFixed(2)} sub="(K + A) / D" accent={ov.kda >= 3 ? "#3ecf8e" : undefined} />
      <Tile label="Ø Rating" value={ov.avgScore === null ? "–" : score.toFixed(2)} sub="1.00 = Lobby-Schnitt" />
      <div className="surface flex items-center gap-4 p-4">
        <GradeBadge grade={avgGrade} size="md" />
        <div><div className="label">Ø Note</div><div className="text-sm text-muted">{avgGrade ? GRADE_STYLE[avgGrade].label : "Noch keine Bewertung"}</div></div>
      </div>
    </div>
  );
}
function gradeOf(score: number): Grade {
  return score >= 1.45 ? "S" : score >= 1.2 ? "A" : score >= 0.95 ? "B" : score >= 0.75 ? "C" : score >= 0.55 ? "D" : "F";
}

/* ---------- Matchliste ---------- */
function MatchList({ matches, account, pending }: { matches?: MatchListItem[]; account: number; pending: number }) {
  const [filter, setFilter] = useState<"all" | "win" | "loss">("all");
  const [limit, setLimit] = useState(20);
  const filtered = useMemo(() => (matches ?? []).filter((m) => filter === "all" || (filter === "win") === m.won), [matches, filter]);
  return (
    <section id="matches" className="surface fade-up overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <h2 className="display text-lg font-bold">Letzte Matches</h2>
        {pending > 0 && <span className="chip"><span className="live-dot" /> {pending} laden Details</span>}
        <div className="ml-auto flex gap-1">
          {([["all", "Alle"], ["win", "Siege"], ["loss", "Niederlagen"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setFilter(k); setLimit(20); }} className={`tab ${filter === k ? "tab-active" : ""}`}>{l}</button>
          ))}
        </div>
      </div>
      {!matches && <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16" />)}</div>}
      {matches && filtered.length === 0 && <div className="p-10 text-center text-muted">Keine Matches gefunden.</div>}
      <div>
        {filtered.slice(0, limit).map((m, i) => <MatchRow key={m.matchId} m={m} account={account} delay={Math.min(i, 10) * 30} />)}
      </div>
      {filtered.length > limit && (
        <button onClick={() => setLimit((l) => l + 20)} className="w-full border-t border-white/[0.06] py-3 text-sm text-muted hover:bg-white/[0.04] hover:text-white">
          Mehr laden ({filtered.length - limit} weitere)
        </button>
      )}
    </section>
  );
}

function MatchRow({ m, account, delay }: { m: MatchListItem; account: number; delay: number }) {
  const heroName = useHeroName();
  const kda = (m.kills + m.assists) / Math.max(1, m.deaths);
  const col = m.won ? "#3ecf8e" : "#f0616d";
  return (
    <a href={`/match/${m.matchId}?account=${account}`} style={{ animationDelay: `${delay}ms` }}
      className="group fade-up relative flex items-center gap-3 border-b border-white/[0.04] px-4 py-3 transition hover:bg-white/[0.035]">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: col, boxShadow: `0 0 14px ${col}` }} />
      <div className="relative">
        <HeroPortrait id={m.heroId} size={52} />
        <span className="absolute -bottom-1 -right-1"><GradeBadge grade={m.grade} size="xs" /></span>
      </div>
      <div className="w-36 min-w-0">
        <div className="truncate font-semibold">{heroName(m.heroId)}</div>
        <div className="text-xs" style={{ color: col }}>{m.won ? "Sieg" : "Niederlage"} <span className="text-muted">· {fmtDuration(m.durationS)}</span></div>
      </div>
      <div className="num w-28">
        <div className="text-[15px] font-semibold"><span>{m.kills}</span><span className="text-muted"> / </span><span className="text-loss">{m.deaths}</span><span className="text-muted"> / </span><span>{m.assists}</span></div>
        <div className="text-xs text-muted">{kda.toFixed(2)} KDA</div>
      </div>
      <div className="num hidden w-20 md:block"><div className="text-sm font-medium">{fmtK(m.netWorth)}</div><div className="text-xs text-muted">Souls</div></div>
      <div className="hidden w-32 sm:block">{m.lobbyBadge ? <RankEmblem badge={m.lobbyBadge} size={30} label /> : <span className="text-xs text-muted">Rang folgt …</span>}</div>
      <div className="ml-auto text-right text-xs text-muted">
        {fmtAgo(m.startTime + m.durationS)}
        {m.detectedAfterS !== null && <div className="text-amber" title="Zeit zwischen Spielende und Erkennung">⚡ {m.detectedAfterS}s</div>}
      </div>
      <span className="text-muted transition group-hover:translate-x-0.5 group-hover:text-white">›</span>
    </a>
  );
}

/* ---------- Seitenleiste ---------- */
function Sidebar({ ov }: { ov?: Overview }) {
  const heroName = useHeroName();
  if (!ov) return <div className="space-y-5"><div className="skeleton h-48" /><div className="skeleton h-40" /></div>;
  const maxGrade = Math.max(1, ...Object.values(ov.gradeCounts));
  return (
    <aside className="space-y-5">
      <section className="surface fade-up p-4">
        <h3 className="label mb-3">Leistungsverlauf</h3>
        <Sparkline values={ov.trend} />
        <div className="mt-1 flex justify-between text-[10px] text-muted"><span>ältere Matches</span><span>aktuell</span></div>
      </section>
      <section className="surface fade-up p-4">
        <h3 className="label mb-3">Form · letzte {ov.form.length}</h3>
        <FormDots form={ov.form} />
      </section>
      <section className="surface fade-up p-4">
        <h3 className="label mb-3">Notenverteilung</h3>
        <div className="flex h-24 items-end gap-2">
          {GRADES.map((g) => (
            <div key={g} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="num text-xs text-muted">{ov.gradeCounts[g]}</span>
              <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, (ov.gradeCounts[g] / maxGrade) * 56)}px`, background: GRADE_STYLE[g].bg, boxShadow: `0 0 12px -4px ${GRADE_STYLE[g].glow}` }} />
              <span className="display text-sm font-bold">{g}</span>
            </div>
          ))}
        </div>
      </section>
      <section id="heroes" className="surface fade-up overflow-hidden">
        <h3 className="label px-4 pt-4">Helden</h3>
        <div className="mt-2 divide-y divide-white/[0.04]">
          {ov.heroes.map((h) => {
            const wr = h.wins / h.matches;
            return (
              <div key={h.heroId} className="flex items-center gap-3 px-4 py-2.5">
                <HeroPortrait id={h.heroId} size={40} variant="small" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm"><span className="truncate font-semibold">{heroName(h.heroId)}</span><span className="num text-xs text-muted">{h.matches} Spiele</span></div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-white/[0.07]"><div className="h-full rounded-full" style={{ width: `${wr * 100}%`, background: wr >= 0.5 ? "linear-gradient(90deg,#1d8a5c,#3ecf8e)" : "linear-gradient(90deg,#a02535,#f0616d)" }} /></div>
                    <span className="num w-9 text-right text-xs">{Math.round(wr * 100)}%</span>
                    <span className="num w-14 text-right text-xs text-muted">{h.kda.toFixed(1)} KDA</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

/* ---------- Onboarding & Skeleton ---------- */
function Onboarding({ demo, first, onSubmit, onDone }: { demo: boolean; first: boolean; onSubmit: (v: string) => Promise<string | null>; onDone: () => void }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="relative mx-auto mt-10 max-w-xl text-center fade-up">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-amber/20 blur-[90px]" style={{ animation: "float-glow 9s ease-in-out infinite" }} />
      <div className="relative">
        <div className="mx-auto w-fit"><LogoMark size={96} /></div>
        <h1 className="display mt-5 text-5xl font-extrabold tracking-tight"><span className="text-gold-grad">Deadlock</span> Tracker</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">Tracke jedes Match direkt nach dem Spiel – mit Match Summary, Rang der Lobby und deiner Performance-Note.</p>
        <form className="surface mt-8 p-5 text-left" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          const r = await onSubmit(v); setBusy(false);
          if (r) setErr(r); else { setV(""); onDone(); }
        }}>
          <label className="label" htmlFor="acc">Steam-Account</label>
          <input id="acc" className="input mt-2" value={v} onChange={(e) => setV(e.target.value)} autoFocus
            placeholder="Steam-ID oder steamcommunity.com/profiles/…" />
          <p className="mt-2 text-xs text-muted">Steam32-ID, Steam64-ID oder Profil-Link. Vanity-URLs (/id/name) werden nicht aufgelöst.{demo && " Demo-Modus: jede Zahl funktioniert."}</p>
          {err && <p className="mt-3 text-sm text-loss">{err}</p>}
          <div className="mt-4 flex gap-2">
            <button disabled={busy || !v.trim()} className="btn btn-gold flex-1 disabled:opacity-50">{busy ? "Verbinde …" : "Tracking starten"}</button>
            {!first && <button type="button" onClick={onDone} className="btn btn-ghost">Abbrechen</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

function Skeleton() {
  return <div className="space-y-5"><div className="skeleton h-56" /><div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div><div className="skeleton h-96" /></div>;
}
