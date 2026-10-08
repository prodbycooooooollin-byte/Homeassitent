"use client";
import { useEffect, useState } from "react";
import { Empty, PageTitle } from "@/components/ui";
import { Avatar, HeroPortrait, RankEmblem, useHeroName } from "@/components/GameAssets";
import { Icon } from "@/components/Icon";
import { GRADE_STYLE } from "@/components/GradeBadge";
import { NavLink } from "@/components/NavLink";
import { useTracker } from "@/components/Providers";
import { COMPONENT_LABELS, COMPONENT_ORDER } from "@/lib/rating";
import { formatBadge } from "@/lib/ranks";
import type { Grade } from "@/lib/types";
import type { HeroAgg, Overview } from "@/lib/view";

interface Side {
  player: { accountId: number; name: string; avatar?: string };
  overview: Overview; heroes: HeroAgg[]; radar: { labels: string[]; values: number[] } | null;
  avg: { kills: number; deaths: number; assists: number; soulsPerMin: number; minutes: number; last10Wr: number };
}
interface Res { a: Side; b: Side; shared: { list: { matchId: number; startTime: number; together: boolean; aWon: boolean; aHero: number; bHero: number }[]; together: { games: number; wins: number }; against: { games: number; aWins: number } } }
const A = "#f0b44c", B = "#4aa3ff";

export default function ComparePage() {
  const { status, account } = useTracker();
  const players = status?.players ?? [];
  const [other, setOther] = useState<number | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = Number(new URLSearchParams(window.location.search).get("b"));
    if (q) setOther(q);
  }, []);
  useEffect(() => { if (other === null && players.length > 1) setOther(players.find((p) => p.accountId !== account)?.accountId ?? null); }, [players, account, other]);
  useEffect(() => {
    if (!account || !other) return;
    setRes(null); setErr(null);
    fetch(`/api/compare?a=${account}&b=${other}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setRes(j); }).catch((e) => setErr(e.message));
  }, [account, other]);

  if (players.length < 2) return (<><PageTitle title="Vergleich" sub="Zwei getrackte Spieler direkt gegenüberstellen" /><Empty icon="swap" title="Mindestens zwei Accounts nötig" text="Füge über die Suche oben einen Freund oder Rivalen hinzu – dann siehst du hier, wer die Nase vorn hat. Spieler aus deiner Mitspieler-Liste lassen sich dort mit einem Klick tracken." /></>);
  return (
    <>
      <PageTitle title="Vergleich" sub="Kampfwerte, Heldenpool, Form und gemeinsame Matches im Direktvergleich"
        right={<select value={other ?? ""} onChange={(e) => setOther(Number(e.target.value))} className="input !w-auto !py-1.5">{players.filter((p) => p.accountId !== account).map((p) => <option key={p.accountId} value={p.accountId}>{p.name}</option>)}</select>} />
      {err && <div className="surface p-5 text-loss">{err}</div>}
      {!res && !err && <><div className="skeleton h-48" /><div className="skeleton h-96" /></>}
      {res && <Body r={res} />}
    </>
  );
}

function Body({ r }: { r: Res }) {
  const { a, b } = r;
  type CRow = { label: string; va: number | null; vb: number | null; fmt: (v: number) => string; lowerBetter?: boolean };
  const rows: CRow[] = [
    { label: "Matches", va: a.overview.matches, vb: b.overview.matches, fmt: String },
    { label: "Winrate", va: a.overview.winrate, vb: b.overview.winrate, fmt: (v) => `${Math.round(v * 100)}%` },
    { label: "Winrate (letzte 10)", va: a.avg.last10Wr, vb: b.avg.last10Wr, fmt: (v) => `${Math.round(v * 100)}%` },
    { label: "KDA", va: a.overview.kda, vb: b.overview.kda, fmt: (v) => v.toFixed(2) },
    { label: "Ø Rating", va: a.overview.avgScore, vb: b.overview.avgScore, fmt: (v) => v.toFixed(2) },
    { label: "Kills / Match", va: a.avg.kills, vb: b.avg.kills, fmt: (v) => v.toFixed(1) },
    { label: "Tode / Match", va: a.avg.deaths, vb: b.avg.deaths, fmt: (v) => v.toFixed(1), lowerBetter: true },
    { label: "Assists / Match", va: a.avg.assists, vb: b.avg.assists, fmt: (v) => v.toFixed(1) },
    { label: "Souls / Min", va: a.avg.soulsPerMin, vb: b.avg.soulsPerMin, fmt: (v) => Math.round(v).toString() },
  ];
  const wins = rows.map((x) => (x.va === null || x.vb === null || x.va === x.vb ? 0 : (x.lowerBetter ? x.va < x.vb : x.va > x.vb) ? 1 : -1));
  const aW = wins.filter((w) => w > 0).length, bW = wins.filter((w) => w < 0).length;
  const grades = (o: Overview) => (["S", "A", "B", "C", "D", "F"] as Grade[]).map((g) => ({ g, n: o.gradeCounts[g] }));

  return (
    <>
      {/* Duell-Kopf */}
      <section className="surface relative overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2" style={{ background: `radial-gradient(500px 220px at 20% 50%, ${A}22, transparent)` }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2" style={{ background: `radial-gradient(500px 220px at 80% 50%, ${B}22, transparent)` }} />
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Fighter s={a} color={A} score={aW} />
          <div className="text-center"><div className="display text-4xl font-extrabold text-muted">VS</div><div className="num mt-1 text-xs text-muted">{aW} : {bW}</div></div>
          <Fighter s={b} color={B} score={bW} right />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="surface overflow-hidden">
          {rows.map((x, i) => {
            const total = (x.va ?? 0) + (x.vb ?? 0) || 1;
            const wa = wins[i] > 0, wb = wins[i] < 0;
            return (
              <div key={x.label} className="border-b border-white/[0.05] px-5 py-3 last:border-0">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="display num flex items-center gap-1.5 text-xl font-bold" style={{ color: wa ? A : undefined }}>{wa && <Icon name="crown" size={14} />}{x.va === null ? "–" : x.fmt(x.va)}</span>
                  <span className="label">{x.label}</span>
                  <span className="display num flex items-center gap-1.5 text-xl font-bold" style={{ color: wb ? B : undefined }}>{x.vb === null ? "–" : x.fmt(x.vb)}{wb && <Icon name="crown" size={14} />}</span>
                </div>
                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full"><div style={{ width: `${((x.va ?? 0) / total) * 100}%`, background: `linear-gradient(90deg,#b8741a,${A})`, opacity: wa ? 1 : 0.5 }} /><div style={{ width: `${((x.vb ?? 0) / total) * 100}%`, background: `linear-gradient(90deg,${B},#2a62b8)`, opacity: wb ? 1 : 0.5 }} /></div>
              </div>
            );
          })}
        </section>

        <div className="space-y-6">
          <section className="surface p-5">
            <h2 className="label mb-2">Stärkenprofil</h2>
            <DuelRadar a={a.radar} b={b.radar} />
          </section>
          <section className="surface p-5">
            <h2 className="label mb-3">Notenverteilung</h2>
            {[{ s: a, c: A }, { s: b, c: B }].map(({ s, c }) => (
              <div key={s.player.accountId} className="mb-3 last:mb-0">
                <div className="mb-1 text-xs font-semibold" style={{ color: c }}>{s.player.name}</div>
                <div className="flex gap-1">{grades(s.overview).map(({ g, n }) => <div key={g} className="flex-1 text-center" title={`${n}× ${g}`}><div className="num mb-0.5 text-[10px] text-muted">{n}</div><div className="h-1.5 rounded-full" style={{ background: GRADE_STYLE[g].glow.replace(/[\d.]+\)$/, "1)"), opacity: n ? 1 : 0.2 }} /><div className="display text-xs font-bold">{g}</div></div>)}</div>
              </div>
            ))}
          </section>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-5">
          <h2 className="label mb-3">Heldenpool</h2>
          <div className="grid grid-cols-2 gap-4">{[{ s: a, c: A }, { s: b, c: B }].map(({ s, c }) => <Pool key={s.player.accountId} heroes={s.heroes} color={c} />)}</div>
        </section>
        <section className="surface p-5">
          <h2 className="label mb-3">Gemeinsame Matches</h2>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Together label="Zusammen im Team" games={r.shared.together.games} detail={`${r.shared.together.wins} Siege`} />
            <Together label="Gegeneinander" games={r.shared.against.games} detail={`${a.player.name}: ${r.shared.against.aWins} · ${b.player.name}: ${r.shared.against.games - r.shared.against.aWins}`} />
          </div>
          {r.shared.list.length === 0 ? <p className="text-sm text-muted">Noch keine gemeinsamen Matches gefunden (nur Matches mit geladenen Details werden berücksichtigt).</p> : (
            <div className="space-y-1">{r.shared.list.slice(0, 8).map((m) => <Shared key={m.matchId} m={m} account={a.player.accountId} />)}</div>
          )}
        </section>
      </div>
    </>
  );
}

function Fighter({ s, color, score, right }: { s: Side; color: string; score: number; right?: boolean }) {
  return (
    <div className={`flex items-center gap-4 ${right ? "flex-row-reverse text-right" : ""}`}>
      <Avatar src={s.player.avatar} name={s.player.name} size={80} ring={color} />
      <div className="min-w-0"><div className="display truncate text-2xl font-extrabold" style={{ color }}>{s.player.name}</div>
        <div className={`mt-1 flex items-center gap-2 ${right ? "justify-end" : ""}`}><RankEmblem badge={s.overview.currentBadge} size={36} /><span className="text-sm text-muted">{s.overview.currentBadge ? formatBadge(s.overview.currentBadge) : "Kein Rang"}</span></div>
        <div className="num mt-1 text-xs text-muted">{score} Kategorien gewonnen</div></div>
    </div>
  );
}

function Pool({ heroes, color }: { heroes: HeroAgg[]; color: string }) {
  const name = useHeroName();
  return <div className="space-y-2">{heroes.slice(0, 5).map((h) => (
    <div key={h.heroId} className="flex items-center gap-2.5"><HeroPortrait id={h.heroId} size={32} variant="small" ring={color} /><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{name(h.heroId)}</div><div className="num text-[10px] text-muted">{h.matches}× · {Math.round((h.wins / h.matches) * 100)}%</div></div></div>
  ))}{!heroes.length && <p className="text-xs text-muted">–</p>}</div>;
}

function Together({ label, games, detail }: { label: string; games: number; detail: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"><div className="label !text-[9px]">{label}</div><div className="display num text-2xl font-extrabold">{games}</div><div className="text-[11px] text-muted">{detail}</div></div>;
}

function Shared({ m, account }: { m: Res["shared"]["list"][number]; account: number }) {
  const name = useHeroName();
  return (
    <NavLink href={`/match/${m.matchId}?account=${account}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/[0.05]">
      <HeroPortrait id={m.aHero} size={26} variant="small" className="!rounded-md" /><span className="text-muted">{m.together ? "mit" : "gegen"}</span><HeroPortrait id={m.bHero} size={26} variant="small" className="!rounded-md" />
      <span className="flex-1 truncate text-xs text-muted">{name(m.aHero)} · {name(m.bHero)}</span>
      <span className={`text-xs font-semibold ${m.aWon ? "text-win" : "text-loss"}`}>{m.together ? (m.aWon ? "Sieg" : "Niederlage") : m.aWon ? "A gewinnt" : "B gewinnt"}</span>
    </NavLink>
  );
}

function DuelRadar({ a, b }: { a: Side["radar"]; b: Side["radar"] }) {
  if (!a || !b) return <p className="text-sm text-muted">Noch keine Bewertungsdaten.</p>;
  const S = 240, c = S / 2, R = 84, n = COMPONENT_ORDER.length;
  const pt = (i: number, v: number) => { const ang = (Math.PI * 2 * i) / n - Math.PI / 2; const k = (Math.min(v, 2) / 2) * R; return [c + Math.cos(ang) * k, c + Math.sin(ang) * k]; };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[280px]">
      {[0.5, 1, 1.5, 2].map((g) => <polygon key={g} points={poly(Array(n).fill(g))} fill="none" stroke={g === 1 ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.08)"} strokeDasharray={g === 1 ? "3 3" : undefined} />)}
      {COMPONENT_ORDER.map((_, i) => <line key={i} x1={c} y1={c} x2={pt(i, 2)[0]} y2={pt(i, 2)[1]} stroke="rgba(255,255,255,.08)" />)}
      <polygon points={poly(a.values)} fill={`${A}33`} stroke={A} strokeWidth="2" /><polygon points={poly(b.values)} fill={`${B}33`} stroke={B} strokeWidth="2" />
      {COMPONENT_ORDER.map((k, i) => { const [x, y] = pt(i, 2.5); return <text key={k} x={x} y={y + 3} textAnchor="middle" fontSize="8.5" fill="#8b94a8">{COMPONENT_LABELS[k].split(" ")[0]}</text>; })}
    </svg>
  );
}
