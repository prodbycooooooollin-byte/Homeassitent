"use client";
import { useMemo } from "react";
import { HeroPortrait, useHeroName } from "../GameAssets";
import { NavLink } from "../NavLink";
import { HoverCard } from "../Popover";
import { valueAt } from "@/lib/timeline";
import { useTracker } from "../Providers";
import { fmtK } from "@/lib/format";
import type { MatchDetails, MatchPlayer, TeamId } from "@/lib/types";

/* Match-Summary: jede verfügbare Kennzahl aller 12 Spieler nebeneinander (links dein Team, rechts die Gegner).
 * Die beste Zahl je Zeile ist grün, deine Spalte ist umrandet. */

interface Row {
  label: string;
  tip?: string;
  /** Zahl für die Anzeige und den Vergleich; null = nicht verfügbar */
  v: (p: MatchPlayer, c: Ctx) => number | null;
  fmt?: (n: number, p: MatchPlayer, c: Ctx) => string;
  /** Vergleichsrichtung: high = höher ist besser, low = niedriger ist besser, none = nur anzeigen */
  better?: "high" | "low" | "none";
  /** Alternativer Anzeigetext (z. B. K/D/A), der Vergleichswert bleibt `v` */
  text?: (p: MatchPlayer, c: Ctx) => string | null;
}
interface Section { title: string; rows: Row[] }
interface Ctx { d: MatchDetails; mins: number; teamKills: Record<TeamId, number>; teamDmg: Record<TeamId, number> }

const tl = (p: MatchPlayer, k: "nw" | "k" | "d" | "a" | "dmg", t: number) => (p.timeline ? valueAt(p.timeline as never, k, t) : null);
const phase = (p: MatchPlayer, k: "k" | "d" | "a", t: number, late: boolean) => { const at = tl(p, k, t); if (at === null) return null; const tot = k === "k" ? p.kills : k === "d" ? p.deaths : p.assists; return Math.max(0, Math.round(late ? tot - at : at)); };
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const int = (n: number) => String(Math.round(n));
const k1 = (n: number) => (Math.abs(n) >= 1000 ? fmtK(n) : String(Math.round(n)));
const dec = (n: number) => n.toFixed(2);

const SECTIONS: Section[] = [
  { title: "Allgemein", rows: [
    { label: "Kills", v: (p) => p.kills, better: "high" },
    { label: "Tode", v: (p) => p.deaths, better: "low" },
    { label: "Assists", v: (p) => p.assists, better: "high" },
    { label: "Heldenschaden", v: (p) => p.heroDamage, fmt: k1, better: "high" },
    { label: "Objective-Schaden", v: (p) => p.objectiveDamage, fmt: k1, better: "high" },
    { label: "Heilung gesamt", tip: "Heilung inklusive Selbstheilung", v: (p) => p.healing, fmt: k1, better: "high" },
    { label: "Level", v: (p) => p.level, better: "high" },
  ] },
  { title: "Wirtschaft", rows: [
    { label: "Souls", v: (p) => p.netWorth, fmt: k1, better: "high" },
    { label: "Souls / Min", v: (p, c) => p.netWorth / c.mins, fmt: k1, better: "high" },
    { label: "Lane-Creeps", tip: "Getroffene Lane-Creeps", v: (p) => p.creeps?.lane ?? null, better: "high" },
    { label: "Creep-Quote", tip: "Anteil der möglichen Lane-Creeps, den du getroffen hast", v: (p) => (p.creeps && p.creeps.possible > 0 ? p.creeps.lane / p.creeps.possible : null), fmt: pct, better: "high" },
    { label: "Neutrale Camps", v: (p) => p.creeps?.neutral ?? null, better: "high" },
    { label: "Denies", v: (p) => p.denies, better: "high" },
    { label: "Gekaufte Items", v: (p) => (p.items ? p.items.length : null), better: "none" },
  ] },
  { title: "Soul-Quellen", rows: [
    { label: "Aus Kills", v: (p) => p.souls?.kills ?? null, fmt: k1, better: "high" },
    { label: "Aus Lane-Creeps", v: (p) => p.souls?.lane ?? null, fmt: k1, better: "high" },
    { label: "Aus Camps", v: (p) => p.souls?.neutral ?? null, fmt: k1, better: "high" },
    { label: "Aus Objectives", v: (p) => p.souls?.boss ?? null, fmt: k1, better: "high" },
    { label: "Aus Kisten", v: (p) => p.souls?.treasure ?? null, fmt: k1, better: "high" },
    { label: "Durch Denies", v: (p) => p.souls?.denied ?? null, fmt: k1, better: "high" },
    { label: "Durch Tode verloren", v: (p) => p.souls?.lost ?? null, fmt: k1, better: "low" },
  ] },
  { title: "Effizienz", rows: [
    { label: "KDA", tip: "(Kills + Assists) / Tode", v: (p) => (p.kills + p.assists) / Math.max(1, p.deaths), fmt: dec, better: "high" },
    { label: "Kill-Beteiligung", tip: "Anteil deiner Kills und Assists an den Team-Kills", v: (p, c) => (p.kills + p.assists) / Math.max(1, c.teamKills[p.team]), fmt: pct, better: "high" },
    { label: "Schaden / Min", v: (p, c) => p.heroDamage / c.mins, fmt: k1, better: "high" },
    { label: "Schadensanteil", tip: "Anteil am Heldenschaden deines Teams", v: (p, c) => p.heroDamage / Math.max(1, c.teamDmg[p.team]), fmt: pct, better: "high" },
    { label: "Objective-Schaden / Min", v: (p, c) => p.objectiveDamage / c.mins, fmt: k1, better: "high" },
  ] },
  { title: "Kampf", rows: [
    { label: "Trefferquote", tip: "Getroffene Schüsse / alle Schüsse", v: (p) => (p.shotsHit !== undefined && p.shotsMissed !== undefined && p.shotsHit + p.shotsMissed > 0 ? p.shotsHit / (p.shotsHit + p.shotsMissed) : null), fmt: pct, better: "high" },
    { label: "Treffer auf Helden", tip: "Anteil der Treffer, der Helden getroffen hat", v: (p) => (p.heroHits !== undefined && p.shotsHit ? p.heroHits / p.shotsHit : null), fmt: pct, better: "high" },
    { label: "Kopftreffer-Quote", tip: "Anteil der Heldentreffer, die Kopftreffer sind", v: (p) => (p.heroCrits !== undefined && p.heroHits ? p.heroCrits / p.heroHits : null), fmt: pct, better: "high" },
    { label: "Schaden / Leben", tip: "Heldenschaden pro Tod", v: (p) => p.heroDamage / Math.max(1, p.deaths), fmt: k1, better: "high" },
  ] },
  { title: "Spielphasen", rows: [
    { label: "Frühe Kills", tip: "Kills bis Minute 10", v: (p) => phase(p, "k", 600, false), better: "high" },
    { label: "Späte Kills", tip: "Kills ab Minute 10", v: (p) => phase(p, "k", 600, true), better: "high" },
    { label: "Frühe Tode", tip: "Tode bis Minute 10", v: (p) => phase(p, "d", 600, false), better: "low" },
    { label: "Späte Tode", tip: "Tode ab Minute 10", v: (p) => phase(p, "d", 600, true), better: "low" },
    { label: "Lane K/D/A", tip: "Bis 8:00", v: (p) => { const k = phase(p, "k", 480, false), d = phase(p, "d", 480, false), a = phase(p, "a", 480, false); return k === null || d === null || a === null ? null : (k + a) / Math.max(1, d); }, text: (p) => { const k = phase(p, "k", 480, false), d = phase(p, "d", 480, false), a = phase(p, "a", 480, false); return k === null || d === null || a === null ? null : `${k}/${d}/${a}`; }, better: "high" },
    { label: "Nach der Lane K/D/A", tip: "Ab 8:00", v: (p) => { const k = phase(p, "k", 480, true), d = phase(p, "d", 480, true), a = phase(p, "a", 480, true); return k === null || d === null || a === null ? null : (k + a) / Math.max(1, d); }, text: (p) => { const k = phase(p, "k", 480, true), d = phase(p, "d", 480, true), a = phase(p, "a", 480, true); return k === null || d === null || a === null ? null : `${k}/${d}/${a}`; }, better: "high" },
    { label: "Souls bei 8:00", tip: "Net Worth nach der Lane-Phase", v: (p) => tl(p, "nw", 480), fmt: k1, better: "high" },
  ] },
  { title: "Tanking", rows: [
    { label: "Erlittener Schaden", v: (p) => p.damageTaken, fmt: k1, better: "none" },
    { label: "Verhinderter Schaden", tip: "Durch Resistenzen/Schilde verhinderter Schaden", v: (p) => p.mitigated ?? null, fmt: k1, better: "high" },
    { label: "Verhindert in %", v: (p) => (p.mitigated !== undefined && p.mitigated + p.damageTaken > 0 ? p.mitigated / (p.mitigated + p.damageTaken) : null), fmt: pct, better: "high" },
  ] },
  { title: "Support", rows: [
    { label: "Heilung/Schilde für Mitspieler", v: (p) => p.allyHealing ?? null, fmt: k1, better: "high" },
    { label: "Selbstheilung & sonstige", v: (p) => p.healing, fmt: k1, better: "none" },
  ] },
  { title: "Tod & Zeit", rows: [
    { label: "Zeit tot", tip: "Summe der Respawn-Zeiten", v: (p) => (p.deadTimeS !== undefined ? p.deadTimeS / 60 : null), fmt: (n) => `${n.toFixed(1)} Min`, better: "low" },
    { label: "Ø Respawn", v: (p) => (p.deathLog && p.deathLog.length ? p.deathLog.reduce((a, x) => a + (x.durS ?? 0), 0) / p.deathLog.length : null), fmt: (n) => `${Math.round(n)} s`, better: "low" },
    { label: "Zeit pro Tod", tip: "Durchschnittliche Zeit zwischen deinen Toden", v: (p, c) => (p.deaths > 0 ? c.d.durationS / 60 / p.deaths : null), fmt: (n) => `${n.toFixed(1)} Min`, better: "high" },
  ] },
];

export function SummaryTab({ d, account }: { d: MatchDetails; account: number }) {
  const heroName = useHeroName();
  const { viewPlayer } = useTracker();
  const me = d.players.find((p) => p.accountId === account);
  const myTeam: TeamId = me?.team ?? 0;
  const ctx = useMemo<Ctx>(() => ({
    d, mins: Math.max(1, d.durationS / 60),
    teamKills: { 0: d.players.filter((p) => p.team === 0).reduce((a, p) => a + p.kills, 0), 1: d.players.filter((p) => p.team === 1).reduce((a, p) => a + p.kills, 0) },
    teamDmg: { 0: d.players.filter((p) => p.team === 0).reduce((a, p) => a + p.heroDamage, 0), 1: d.players.filter((p) => p.team === 1).reduce((a, p) => a + p.heroDamage, 0) },
  }), [d]);
  const order = (t: TeamId) => d.players.filter((p) => p.team === t).sort((a, b) => b.netWorth - a.netWorth);
  const left = order(myTeam), right = order(myTeam === 0 ? 1 : 0);
  const all = [...left, ...right];
  const COLS = "grid-cols-[repeat(6,minmax(0,1fr))_170px_repeat(6,minmax(0,1fr))]";

  const Head = ({ p }: { p: MatchPlayer }) => (
    <div className={`flex flex-col items-center gap-1 px-1 py-2 ${p.accountId === account ? "rounded-lg bg-amber/10 ring-1 ring-amber/40" : ""}`}>
      <HeroPortrait id={p.heroId} size={38} variant="small" className="!rounded-lg" />
      {p.accountId === account || !p.accountId
        ? <span className="max-w-full truncate text-[10px] font-semibold">{p.accountId === account ? "Du" : p.name ?? heroName(p.heroId)}</span>
        : <button onClick={() => void viewPlayer(p.accountId)} className="max-w-full truncate text-[10px] font-semibold hover:text-amber hover:underline" title="Profil ansehen">{p.name ?? heroName(p.heroId)}</button>}
    </div>
  );

  return (
    <section className="surface overflow-x-auto p-3 sm:p-4">
      <div className="min-w-[980px]">
        <div className={`sticky top-0 z-10 grid ${COLS} items-end border-b border-white/[0.08] bg-[#0b0e15]/95 pb-1 backdrop-blur`}>
          {left.map((p) => <Head key={p.accountId + "L" + p.slot} p={p} />)}
          <div className="pb-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted">Match-Summary</div>
          {right.map((p) => <Head key={p.accountId + "R" + p.slot} p={p} />)}
        </div>
        {SECTIONS.map((sec) => {
          const rows = sec.rows.filter((r) => all.some((p) => r.v(p, ctx) !== null));
          if (!rows.length) return null;
          return (
            <div key={sec.title}>
              <div className="my-3 flex items-center gap-3"><div className="h-px flex-1 bg-white/[0.07]" /><span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{sec.title}</span><div className="h-px flex-1 bg-white/[0.07]" /></div>
              {rows.map((r) => {
                const nums = all.map((p) => r.v(p, ctx));
                const present = nums.filter((n): n is number => n !== null);
                const best = r.better === "high" ? Math.max(...present) : r.better === "low" ? Math.min(...present) : null;
                const informative = best !== null && present.some((n) => n !== best);
                const cell = (p: MatchPlayer, idx: number) => {
                  const n = nums[idx];
                  const isBest = informative && n !== null && n === best;
                  const txt = n === null ? "–" : r.text ? r.text(p, ctx) ?? "–" : r.fmt ? r.fmt(n, p, ctx) : String(Math.round(n * 100) / 100);
                  return (
                    <div key={idx} className={`num flex h-9 items-center justify-center rounded-md text-[13px] font-semibold ${p.accountId === account ? "bg-white/[0.07] ring-1 ring-white/25" : "bg-white/[0.025]"} ${isBest ? "!text-[#3ecf8e]" : n === null ? "text-muted/50" : ""}`}>{txt}</div>
                  );
                };
                return (
                  <div key={r.label} className={`mb-1 grid ${COLS} gap-1 transition hover:[&>div]:brightness-125`}>
                    {left.map((p, i) => cell(p, i))}
                    <div className="flex h-9 items-center justify-center px-1 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted">
                      {r.tip ? <HoverCard width={220} content={<div className="text-xs">{r.tip}</div>}><span className="cursor-help">{r.label}</span></HoverCard> : r.label}
                    </div>
                    {right.map((p, i) => cell(p, left.length + i))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[11px] text-muted">Grün = bester Wert der Zeile in der ganzen Lobby. Werte, die die API für dieses Match nicht liefert (z. B. Trefferdaten in älteren Matches), werden ausgeblendet.</p>
    </section>
  );
}
