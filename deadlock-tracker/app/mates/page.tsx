"use client";
import { useEffect, useMemo, useState } from "react";
import { Empty, Gate, PageTitle } from "@/components/ui";
import { Avatar } from "@/components/GameAssets";
import { Icon, type IconName } from "@/components/Icon";
import { HoverCard } from "@/components/Popover";
import { NavLink } from "@/components/NavLink";
import { useTracker } from "@/components/Providers";

interface Row { accountId: number; name?: string; avatar?: string; games: number; wins: number; matchIds: number[]; tracked: boolean }
interface Res { rows: Row[]; source: "api" | "local" | "none"; error?: string; coverage: { total: number; withDetails: number } }
type Kind = "mates" | "enemies" | "party";
const TABS: { key: Kind; label: string; icon: IconName; hint: string }[] = [
  { key: "mates", label: "Mitspieler", icon: "users", hint: "Spieler, mit denen du im selben Team gespielt hast" },
  { key: "party", label: "Premade", icon: "link", hint: "Spieler, mit denen du als Gruppe gestartet bist" },
  { key: "enemies", label: "Gegner", icon: "sword", hint: "Spieler, gegen die du mehrfach gespielt hast" },
];

export default function MatesPage() {
  return <Gate>{({ me }) => <View account={me.accountId} />}</Gate>;
}

function View({ account }: { account: number }) {
  const { addPlayer } = useTracker();
  const [kind, setKind] = useState<Kind>("mates");
  const [res, setRes] = useState<Res | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"games" | "wr">("games");
  useEffect(() => {
    setRes(null);
    fetch(`/api/mates?account=${account}&kind=${kind}`).then((r) => r.json()).then(setRes).catch(() => setRes({ rows: [], source: "none", error: "Nicht erreichbar", coverage: { total: 0, withDetails: 0 } }));
  }, [account, kind]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = (res?.rows ?? []).filter((r) => !needle || (r.name ?? "").toLowerCase().includes(needle) || String(r.accountId).includes(needle));
    return f.sort((a, b) => (sort === "wr" ? b.wins / b.games - a.wins / a.games || b.games - a.games : b.games - a.games));
  }, [res, q, sort]);
  const ok = (res?.rows ?? []).filter((r) => r.games >= 5);
  const best = ok.length ? ok.reduce((b, r) => (r.wins / r.games > b.wins / b.games ? r : b)) : null;
  const worst = ok.length ? ok.reduce((b, r) => (r.wins / r.games < b.wins / b.games ? r : b)) : null;
  const most = res?.rows[0] ?? null;
  const tab = TABS.find((t) => t.key === kind)!;

  return (
    <>
      <PageTitle title="Mitspieler & Gegner" sub={tab.hint} right={
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {TABS.map((t) => <button key={t.key} onClick={() => setKind(t.key)} className={`tab flex items-center gap-1.5 ${kind === t.key ? "tab-active" : ""}`}><Icon name={t.icon} size={14} />{t.label}</button>)}
        </div>} />

      {res?.source === "local" && (
        <div className="surface flex items-start gap-3 border-amber/30 p-4 text-sm">
          <Icon name="info" size={18} className="mt-0.5 shrink-0 text-amber" />
          <div>Die Deadlock-API ist für diese Auswertung gerade nicht erreichbar{res.error ? ` (${res.error})` : ""}. Angezeigt wird, was aus den bereits geladenen Match-Details berechnet werden konnte: <b>{res.coverage.withDetails} von {res.coverage.total} Matches</b>. Der Tracker lädt die übrigen Details im Hintergrund nach.</div>
        </div>
      )}

      {res && rows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {most && <Highlight icon="users" label={kind === "enemies" ? "Häufigster Gegner" : "Meistgespielt mit"} r={most} sub={`${most.games} Spiele`} />}
          {best && <Highlight icon="trophy" label={kind === "enemies" ? "Liegt dir (Winrate gegen)" : "Bester Partner"} r={best} sub={`${Math.round((best.wins / best.games) * 100)}% Winrate`} tone="#3ecf8e" />}
          {worst && <Highlight icon={kind === "enemies" ? "skull" : "alert"} label={kind === "enemies" ? "Nemesis" : "Schwierigster Partner"} r={worst} sub={`${Math.round((worst.wins / worst.games) * 100)}% Winrate`} tone="#f0616d" />}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1"><Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name oder ID …" className="input !rounded-full pl-9" /></div>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <button onClick={() => setSort("games")} className={`tab !py-1 ${sort === "games" ? "tab-active" : ""}`}>Spiele</button>
          <button onClick={() => setSort("wr")} className={`tab !py-1 ${sort === "wr" ? "tab-active" : ""}`}>Winrate</button>
        </div>
      </div>

      {!res && <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[72px]" />)}</div>}
      {res && rows.length === 0 && <Empty icon="users" title={kind === "party" ? "Keine Premade-Spiele gefunden" : "Noch keine Treffer"} text={kind === "party" ? "Hier erscheinen Spieler, mit denen du als Gruppe gespielt hast." : "Es werden Spieler gezeigt, mit denen du mindestens zweimal gespielt hast."} />}
      {res && rows.length > 0 && (
        <section className="surface overflow-hidden">
          {rows.map((r, i) => {
            const wr = r.wins / r.games, col = wr >= 0.5 ? "#3ecf8e" : "#f0616d";
            return (
              <HoverCard key={r.accountId} width={320} className="!flex w-full" content={<Detail r={r} account={account} />}>
                <div className="fade-up group flex w-full items-center gap-4 border-b border-white/[0.04] px-4 py-3 transition hover:bg-white/[0.04]" style={{ animationDelay: `${Math.min(i, 14) * 30}ms` }}>
                  <span className="display w-7 text-center text-lg text-muted">{i + 1}</span>
                  <div className="transition-transform duration-300 group-hover:scale-105"><Avatar src={r.avatar} name={r.name ?? String(r.accountId)} size={44} ring={`${col}88`} /></div>
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold">{r.name ?? `Spieler ${r.accountId}`}{r.tracked && <span className="chip ml-2 !py-0 text-[10px] text-amber">getrackt</span>}</div><div className="text-xs text-muted">ID {r.accountId}</div></div>
                  <div className="num hidden w-24 text-right sm:block"><div className="font-semibold">{r.games}</div><div className="text-xs text-muted">Spiele</div></div>
                  <div className="w-40"><div className="num mb-1 flex justify-between text-sm"><span className="font-semibold" style={{ color: col }}>{Math.round(wr * 100)}%</span><span className="text-xs text-muted">{r.wins}S · {r.games - r.wins}N</span></div>
                    <div className="flex h-1.5 gap-px overflow-hidden rounded-full"><div style={{ width: `${wr * 100}%`, background: "linear-gradient(90deg,#1d8a5c,#3ecf8e)" }} /><div style={{ width: `${(1 - wr) * 100}%`, background: "linear-gradient(90deg,#f0616d,#a02535)" }} /></div></div>
                  {!r.tracked && <button onClick={(e) => { e.stopPropagation(); addPlayer(String(r.accountId)); }} className="btn btn-ghost !px-2.5 !py-1 text-xs" title="Diesen Spieler ebenfalls tracken"><Icon name="plusSign" size={13} />Tracken</button>}
                </div>
              </HoverCard>
            );
          })}
        </section>
      )}
    </>
  );
}

function Highlight({ icon, label, r, sub, tone = "#f0b44c" }: { icon: IconName; label: string; r: Row; sub: string; tone?: string }) {
  return (
    <div className="surface surface-hover flex items-center gap-4 p-4" style={{ boxShadow: `0 0 0 1px ${tone}33` }}>
      <Avatar src={r.avatar} name={r.name ?? String(r.accountId)} size={52} ring={tone} />
      <div className="min-w-0"><div className="label flex items-center gap-1.5 !text-[9px]" style={{ color: tone }}><Icon name={icon} size={12} />{label}</div><div className="truncate font-bold">{r.name ?? `Spieler ${r.accountId}`}</div><div className="num text-xs text-muted">{sub}</div></div>
    </div>
  );
}

function Detail({ r, account }: { r: Row; account: number }) {
  return (
    <div className="space-y-2.5 text-sm">
      <div className="flex items-center gap-3"><Avatar src={r.avatar} name={r.name ?? "?"} size={44} /><div><div className="font-bold">{r.name ?? `Spieler ${r.accountId}`}</div><div className="text-xs text-muted">{r.games} gemeinsame Matches · {Math.round((r.wins / r.games) * 100)}% Winrate</div></div></div>
      {r.matchIds.length > 0 && <div><div className="label mb-1.5 !text-[9px]">Letzte Matches</div><div className="flex flex-wrap gap-1.5">{[...r.matchIds].reverse().slice(0, 8).map((id) => <NavLink key={id} href={`/match/${id}?account=${account}`} className="chip !py-0.5 text-[11px] hover:border-amber">#{String(id).slice(-5)}</NavLink>)}</div></div>}
      {r.tracked && <NavLink href={`/compare?b=${r.accountId}`} className="btn btn-ghost w-full !py-1.5 text-xs"><Icon name="swap" size={13} />Mit dir vergleichen</NavLink>}
    </div>
  );
}
