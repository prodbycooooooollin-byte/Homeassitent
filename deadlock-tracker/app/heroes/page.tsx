"use client";
import { subOf } from "@/lib/grade";
import { useMemo, useState } from "react";
import { Empty, Gate, PageTitle } from "@/components/ui";
import { HeroPortrait, useAssets, useHero, useHeroName, useTilt } from "@/components/GameAssets";
import { GradeBadge } from "@/components/GradeBadge";
import { NavLink } from "@/components/NavLink";
import { gradeFor, gradeLabel } from "@/lib/rating";
import { CounterPicker } from "@/components/CounterPicker";
import type { HeroAgg } from "@/lib/view";

export default function HeroesPage() {
  return <Gate>{({ data }) => <HeroesView heroes={data.heroes} />}</Gate>;
}

function HeroesView({ heroes }: { heroes: HeroAgg[] }) {
  const [sort, setSort] = useState<"matches" | "wr" | "kda" | "score">("matches");
  const [tab, setTab] = useState<"mine" | "all" | "counter">("mine");
  const [q, setQ] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const { bundle } = useAssets();
  const played = useMemo(() => new Map(heroes.map((h) => [h.heroId, h])), [heroes]);
  const roster = useMemo(() => Object.values(bundle.heroes).filter((h) => h.playable !== false && h.name.toLowerCase().includes(q.trim().toLowerCase()) && (!onlyNew || !played.has(h.id))).sort((a, b) => a.name.localeCompare(b.name, "de")), [bundle, q, onlyNew, played]);
  const sorted = useMemo(() => {
    const f = [...heroes];
    const wr = (h: HeroAgg) => h.wins / h.matches;
    f.sort((a, b) => sort === "wr" ? wr(b) - wr(a) : sort === "kda" ? b.kda - a.kda : sort === "score" ? (b.avgScore ?? 0) - (a.avgScore ?? 0) : b.matches - a.matches);
    return f;
  }, [heroes, sort]);
  return (
    <>
      <PageTitle title="Helden" sub={`${heroes.length} gespielt · ${Object.values(bundle.heroes).filter((h) => h.playable !== false).length} im Spiel`}
        right={
          <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {([["mine", "Meine Helden"], ["all", "Alle Helden"], ["counter", "Counter-Picker"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`tab ${tab === k ? "tab-active" : ""}`}>{l}</button>
            ))}
          </div>
          {tab === "mine" && <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {([["matches", "Spiele"], ["wr", "Winrate"], ["kda", "KDA"], ["score", "Note"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} className={`tab ${sort === k ? "tab-active" : ""}`}>{l}</button>
            ))}
          </div>}
          </div>
        } />
      {tab === "all" ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Held suchen …" className="input !w-64 !rounded-full" />
            <button onClick={() => setOnlyNew((v) => !v)} className={`btn ${onlyNew ? "btn-gold" : "btn-ghost"} px-3 py-1.5 text-xs`}>Nur noch nicht gespielt</button>
            <span className="text-xs text-muted">{roster.length} Helden</span>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {roster.map((h, i) => <RosterTile key={h.id} id={h.id} agg={played.get(h.id)} i={i} />)}
          </div>
        </>
      ) : tab === "counter" ? <CounterPicker heroes={heroes} /> : heroes.length === 0 ? <Empty title="Noch keine Helden" text="Sobald Matches erkannt wurden, siehst du hier deine Helden-Statistiken." /> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {sorted.map((h, i) => <HeroCard key={h.heroId} h={h} i={i} />)}
        </div>
      )}
    </>
  );
}

function HeroCard({ h, i }: { h: HeroAgg; i: number }) {
  const heroName = useHeroName();
  const { color } = useHero(h.heroId);
  const tilt = useTilt(8);
  const wr = h.wins / h.matches;
  return (
    <NavLink href={`/heroes/${h.heroId}`} className="block fade-up" style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
      <div {...tilt} className="tilt surface group relative overflow-hidden" style={{ boxShadow: `0 0 0 1px ${color}33, 0 24px 50px -30px ${color}` }}>
        <span className="shine z-10" />
        <div className="relative aspect-[4/5] overflow-hidden">
          <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"><HeroPortrait id={h.heroId} fill ratio={0.8} className="!rounded-none" /></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f121a] via-[#0f121a]/20 to-transparent" />
          <div className="absolute right-3 top-3"><GradeBadge grade={h.avgScore === null ? null : gradeFor(h.avgScore)} size="sm" sub={subOf(h.avgScore === null ? null : gradeLabel(h.avgScore))} title="Ø Note" /></div>
          <div className="absolute bottom-3 left-4 right-4">
            <div className="display text-2xl font-extrabold leading-none drop-shadow">{heroName(h.heroId)}</div>
            <div className="num mt-1 text-xs text-white/70">{h.matches} Spiele · {h.wins}S {h.matches - h.wins}N</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 p-4 text-center">
          <div><div className="num text-lg font-bold" style={{ color: wr >= 0.5 ? "#3ecf8e" : "#f0616d" }}>{Math.round(wr * 100)}%</div><div className="label !text-[9px]">Winrate</div></div>
          <div><div className="num text-lg font-bold">{h.kda.toFixed(1)}</div><div className="label !text-[9px]">KDA</div></div>
          <div><div className="num text-lg font-bold">{Math.round(h.soulsPerMin)}</div><div className="label !text-[9px]">Souls/Min</div></div>
        </div>
      </div>
    </NavLink>
  );
}

function RosterTile({ id, agg, i }: { id: number; agg?: HeroAgg; i: number }) {
  const heroName = useHeroName();
  const { color } = useHero(id);
  return (
    <NavLink href={`/heroes/${id}`} className="group block fade-up" style={{ animationDelay: `${Math.min(i, 16) * 25}ms` }}>
      <div className="surface relative overflow-hidden transition group-hover:-translate-y-0.5" style={{ boxShadow: `0 0 0 1px ${color}33` }}>
        <div className={`relative aspect-[4/5] ${agg ? "" : "opacity-60 saturate-[.6] transition group-hover:opacity-100 group-hover:saturate-100"}`}>
          <HeroPortrait id={id} fill ratio={0.8} className="!rounded-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f121a] via-transparent to-transparent" />
          {!agg && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber">Neu für dich</span>}
          <div className="absolute bottom-2 left-2 right-2"><div className="truncate text-sm font-bold drop-shadow">{heroName(id)}</div>
            <div className="num text-[10px] text-white/70">{agg ? `${agg.matches} Spiele · ${Math.round((agg.wins / agg.matches) * 100)} %` : "noch nicht gespielt"}</div></div>
        </div>
      </div>
    </NavLink>
  );
}
