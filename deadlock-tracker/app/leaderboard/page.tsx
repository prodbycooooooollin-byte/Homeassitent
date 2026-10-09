"use client";
import { useEffect, useMemo, useState } from "react";
import { Empty, PageTitle } from "@/components/ui";
import { HeroBackdrop, HeroPortrait, RankEmblem, useAssets, useHeroName, useTilt } from "@/components/GameAssets";
import { Icon } from "@/components/Icon";
import { HoverCard } from "@/components/Popover";
import { useTracker } from "@/components/Providers";
import { formatBadge } from "@/lib/ranks";

interface Row { place: number; name: string; heroIds: number[]; badge?: number; accountIds: number[] }
const REGIONS = [["Europe", "Europa"], ["NAmerica", "Nordamerika"], ["Asia", "Asien"], ["SAmerica", "Südamerika"], ["Oceania", "Ozeanien"]] as const;
const MEDAL = ["#f0b44c", "#cfd6e4", "#cf8a57"];

export default function LeaderboardPage() {
  const { status, addPlayer } = useTracker();
  const { bundle } = useAssets();
  const heroName = useHeroName();
  const [region, setRegion] = useState("Europe");
  const [hero, setHero] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    setRows(null); setErr(null);
    fetch(`/api/leaderboard?region=${region}${hero ? `&hero=${hero}` : ""}`).then((r) => r.json()).then((j) => { setRows(j.rows ?? []); if (j.error) setErr(j.error); }).catch((e) => { setRows([]); setErr(String(e)); });
  }, [region, hero]);

  const tracked = useMemo(() => new Set(status?.players.map((p) => p.accountId)), [status]);
  const heroes = useMemo(() => Object.values(bundle.heroes).filter((h) => h.playable !== false).sort((a, b) => a.name.localeCompare(b.name)), [bundle]);
  const needle = q.trim().toLowerCase();
  const list = (rows ?? []).filter((r) => !needle || r.name.toLowerCase().includes(needle));
  const podium = !needle && rows && rows.length >= 3 ? rows.slice(0, 3) : [];
  const rest = podium.length ? list.slice(3) : list;
  const mine = (rows ?? []).find((r) => r.accountIds.some((id) => tracked.has(id)));

  return (
    <>
      <PageTitle title="Bestenliste" sub={`Ranked-Leaderboard${hero ? ` · ${heroName(hero)}` : ""} · von Valve stündlich aktualisiert`} right={
        <div className="flex flex-wrap items-center gap-2">
          <select value={hero} onChange={(e) => setHero(Number(e.target.value))} className="input !w-auto !py-1.5"><option value={0}>Alle Helden</option>{heroes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">{REGIONS.map(([k, l]) => <button key={k} onClick={() => setRegion(k)} className={`tab !py-1 ${region === k ? "tab-active" : ""}`}>{l}</button>)}</div>
        </div>} />

      {mine && (
        <div className="surface flex items-center gap-3 border-amber/40 p-3 text-sm" style={{ boxShadow: "0 0 24px -8px #f0b44c88" }}>
          <Icon name="crown" size={18} className="text-amber" />Du stehst auf <b className="display text-lg text-gold-grad">Platz {mine.place}</b> der {REGIONS.find(([k]) => k === region)?.[1]}-Bestenliste{hero ? ` für ${heroName(hero)}` : ""}.
        </div>
      )}

      {rows === null && <div className="skeleton h-[480px]" />}
      {rows !== null && !rows.length && <Empty icon="trophy" title="Bestenliste nicht verfügbar" text={err ?? "Für diese Auswahl gibt es gerade keine Einträge."} />}

      {podium.length === 3 && (
        <section className="grid items-end gap-4 md:grid-cols-3">
          {[1, 0, 2].map((i) => <PodiumCard key={i} r={podium[i]} i={i} tracked={tracked} />)}
        </section>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <div className="relative max-w-sm"><Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Spieler in der Liste suchen …" className="input !rounded-full pl-9" /></div>
          <section className="surface overflow-hidden">
            {rest.slice(0, 150).map((r, i) => {
              const me = r.accountIds.some((id) => tracked.has(id));
              const id = r.accountIds[0];
              return (
                <div key={r.place + r.name} className="group fade-up flex items-center gap-4 border-b border-white/[0.04] px-4 py-2.5 transition hover:bg-white/[0.05]" style={{ animationDelay: `${Math.min(i, 14) * 22}ms`, background: me ? "linear-gradient(90deg, rgba(240,180,76,.14), transparent 60%)" : undefined }}>
                  <span className="display w-12 text-center text-xl font-extrabold text-muted transition group-hover:scale-110 group-hover:text-white">{r.place}</span>
                  {r.badge ? <RankEmblem badge={r.badge} size={34} /> : <span className="w-[34px]" />}
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold">{r.name}{me && <span className="chip ml-2 !py-0 text-[10px] text-amber">Du</span>}</div>{r.badge && <div className="text-[11px] text-muted">{formatBadge(r.badge)}</div>}</div>
                  <div className="flex gap-1.5">{r.heroIds.map((h, k) => (
                    <HoverCard key={k} width={170} content={<div className="flex items-center gap-2"><HeroPortrait id={h} size={36} variant="small" /><b className="text-sm">{heroName(h)}</b></div>}>
                      <span className="transition-transform duration-200 hover:-translate-y-0.5 hover:scale-110"><HeroPortrait id={h} size={32} variant="small" className="!rounded-lg" /></span>
                    </HoverCard>))}</div>
                  {id && !tracked.has(id) && <button onClick={() => addPlayer(String(id))} className="btn btn-ghost !px-2.5 !py-1 text-xs opacity-0 transition group-hover:opacity-100" title="Account tracken (Zuordnung laut API nicht immer korrekt)"><Icon name="plusSign" size={13} />Tracken</button>}
                </div>
              );
            })}
            {!rest.length && <div className="p-8 text-center text-muted">Keine Treffer.</div>}
          </section>
        </>
      )}
    </>
  );
}

function PodiumCard({ r, i, tracked }: { r: Row; i: number; tracked: Set<number> }) {
  const tilt = useTilt(7);
  const heroName = useHeroName();
  const c = MEDAL[i];
  const me = r.accountIds.some((id) => tracked.has(id));
  const h = [196, 236, 176][i];
  return (
    <div {...tilt} className="tilt surface fade-up relative overflow-hidden text-center" style={{ minHeight: h + 40, animationDelay: `${[120, 0, 220][i]}ms`, boxShadow: `0 0 0 1px ${c}66, 0 30px 60px -30px ${c}` }}>
      <span className="shine" />
      <div className="pointer-events-none absolute inset-0 opacity-50"><HeroBackdrop id={r.heroIds[0]} /></div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24" style={{ background: `linear-gradient(180deg, ${c}33, transparent)` }} />
      <div className="relative p-5">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full" style={{ background: `${c}22`, color: c, boxShadow: `0 0 20px ${c}66` }}>{i === 0 ? <Icon name="crown" size={22} /> : <span className="display text-xl font-extrabold">{r.place}</span>}</div>
        <div className="display mt-2 text-5xl font-extrabold" style={{ color: c, textShadow: `0 0 24px ${c}88` }}>#{r.place}</div>
        <div className="mt-1 truncate text-lg font-bold">{r.name}{me && <span className="chip ml-2 !py-0 text-[10px] text-amber">Du</span>}</div>
        <div className="mt-3 flex justify-center">{r.badge ? <RankEmblem badge={r.badge} size={i === 0 ? 76 : 60} label /> : null}</div>
        <div className="mt-3 flex justify-center gap-2">{r.heroIds.map((h, k) => <span key={k} title={heroName(h)}><HeroPortrait id={h} size={38} variant="small" ring={c} /></span>)}</div>
      </div>
    </div>
  );
}
