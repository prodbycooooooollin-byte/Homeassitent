"use client";
import { useEffect, useMemo, useState } from "react";
import { Empty, PageTitle } from "@/components/ui";
import { HeroPortrait, useHero, useHeroName, useTilt } from "@/components/GameAssets";
import { HeroDrawer } from "@/components/HeroDrawer";
import { Icon } from "@/components/Icon";
import { useData } from "@/components/Providers";

interface Meta { heroId: number; matches: number; wins: number }
const TIERS = [
  { t: "S", min: 0.535, color: "#f0b44c" }, { t: "A", min: 0.515, color: "#3ecf8e" }, { t: "B", min: 0.495, color: "#4aa3ff" },
  { t: "C", min: 0.475, color: "#a3acbd" }, { t: "D", min: 0, color: "#f0616d" },
];

export default function MetaPage() {
  const [rows, setRows] = useState<Meta[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<"wr" | "pick">("wr");
  const { data } = useData();
  const [open, setOpen] = useState<number | null>(null);
  const mine = useMemo(() => new Set(data?.heroes.map((h) => h.heroId)), [data]);

  useEffect(() => {
    fetch("/api/meta").then((r) => r.json()).then((j) => { setRows(j.heroes ?? []); if (j.error) setErr(j.error); }).catch((e) => { setRows([]); setErr(String(e)); });
  }, []);

  const stats = useMemo(() => {
    if (!rows?.length) return [];
    const total = rows.reduce((a, r) => a + r.matches, 0); // Anteil an allen Picks
    return rows.filter((r) => r.matches > 0).map((r) => ({ ...r, wr: r.wins / r.matches, pick: r.matches / total }));
  }, [rows]);
  const sorted = useMemo(() => [...stats].sort((a, b) => (sort === "wr" ? b.wr - a.wr : b.pick - a.pick)), [stats, sort]);

  return (
    <>
      <PageTitle title="Meta" sub="Globale Helden-Statistik · Ranked · letzte 14 Tage · Held anklicken für Spielstil, Builds und Matchups" right={
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <button onClick={() => setSort("wr")} className={`tab ${sort === "wr" ? "tab-active" : ""}`}>Winrate</button>
          <button onClick={() => setSort("pick")} className={`tab ${sort === "pick" ? "tab-active" : ""}`}>Pickrate</button>
        </div>} />
      <HeroDrawer heroId={open} onClose={() => setOpen(null)} />
      {rows === null && <div className="skeleton h-96" />}
      {rows !== null && !stats.length && <Empty title="Meta-Daten nicht verfügbar" text={err ?? "Die Analytics-API hat gerade keine Daten geliefert."} />}
      {stats.length > 0 && (
        <>
          <section className="surface divide-y divide-white/[0.05]">
            {TIERS.map((tier, ti) => {
              const hs = sorted.filter((h) => h.wr >= tier.min && (ti === 0 || h.wr < TIERS[ti - 1].min));
              if (!hs.length) return null;
              return (
                <div key={tier.t} className="flex items-stretch">
                  <div className="display flex w-16 shrink-0 items-center justify-center text-4xl font-black" style={{ color: tier.color, background: `linear-gradient(90deg, ${tier.color}22, transparent)` }}>{tier.t}</div>
                  <div className="flex flex-wrap gap-2 p-3">{hs.map((h) => <MetaChip key={h.heroId} h={h} mine={mine.has(h.heroId)} onOpen={setOpen} />)}</div>
                </div>
              );
            })}
          </section>
          <section className="surface overflow-hidden">
            <table className="num w-full text-sm">
              <thead><tr className="label text-right [&>th]:px-4 [&>th]:py-3"><th className="text-left">Held</th><th>Winrate</th><th>Pickrate</th><th>Matches</th></tr></thead>
              <tbody>{sorted.map((h) => <MetaRow key={h.heroId} h={h} mine={mine.has(h.heroId)} onOpen={setOpen} />)}</tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}

type Stat = Meta & { wr: number; pick: number };

function MetaChip({ h, mine, onOpen }: { h: Stat; mine: boolean; onOpen: (id: number) => void }) {
  const name = useHeroName();
  const tilt = useTilt(10);
  return (
    <div {...tilt} onClick={() => onOpen(h.heroId)} className="tilt relative cursor-pointer" title={`${name(h.heroId)} · ${(h.wr * 100).toFixed(1)}% WR · ${(h.pick * 100).toFixed(1)}% Pick`}>
      <HeroPortrait id={h.heroId} size={60} h={72} ring={mine ? "#f0b44c" : undefined} />
      <span className="shine" />
      <span className="num absolute inset-x-0 bottom-0 rounded-b-xl bg-black/70 text-center text-[10px] font-semibold">{(h.wr * 100).toFixed(1)}%</span>
    </div>
  );
}

function MetaRow({ h, mine, onOpen }: { h: Stat; mine: boolean; onOpen: (id: number) => void }) {
  const name = useHeroName();
  const { color } = useHero(h.heroId);
  return (
    <tr onClick={() => onOpen(h.heroId)} className="cursor-pointer border-t border-white/[0.05] text-right transition hover:bg-white/[0.06]" style={mine ? { background: "linear-gradient(90deg, rgba(240,180,76,.10), transparent 60%)" } : undefined}>
      <td className="px-4 py-2 text-left"><div className="flex items-center gap-3"><HeroPortrait id={h.heroId} size={34} variant="small" ring={color} /><span className="font-semibold">{name(h.heroId)}</span>{mine && <span className="chip !py-0 text-[10px] text-amber">gespielt</span>}<Icon name="chevron" size={14} className="ml-auto text-muted" /></div></td>
      <td className="px-4" style={{ color: h.wr >= 0.5 ? "#3ecf8e" : "#f0616d" }}>{(h.wr * 100).toFixed(1)}%</td>
      <td className="px-4">{(h.pick * 100).toFixed(1)}%</td>
      <td className="px-4 text-muted">{h.matches.toLocaleString("de-DE")}</td>
    </tr>
  );
}
