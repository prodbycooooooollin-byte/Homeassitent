"use client";
import { useMemo } from "react";
import { HeroPortrait, useHeroName } from "./GameAssets";
import { NavLink } from "./NavLink";
import { GradeBadge } from "./GradeBadge";
import { achievements as buildAch, activity, avgLobby, currentSession, insights, longestWinStreak, radar, records, streak, type Bucket } from "@/lib/profile";
import { linearToBadge, formatBadge } from "@/lib/ranks";
import { fmtAgo } from "@/lib/format";
import type { MatchListItem } from "@/lib/view";

export function SessionCard({ items }: { items: MatchListItem[] }) {
  const s = useMemo(() => currentSession(items), [items]);
  const st = streak(items);
  return (
    <section className="surface p-5">
      <div className="flex items-center justify-between"><h3 className="label">Aktuelle Session</h3>{s && <span className="chip"><span className="live-dot" />aktiv</span>}</div>
      {s ? (
        <>
          <div className="mt-3 flex items-end gap-4">
            <div className="display num text-4xl font-extrabold"><span className="text-win">{s.wins}</span><span className="text-muted">:</span><span className="text-loss">{s.losses}</span></div>
            <div className="pb-1 text-xs text-muted">seit {fmtAgo(s.start)}<br />{s.matches.length} Matches</div>
          </div>
          <div className="mt-3 flex gap-1">{[...s.matches].reverse().map((m) => <span key={m.matchId} title={m.won ? "Sieg" : "Niederlage"} className="h-2 flex-1 rounded-full" style={{ background: m.won ? "#3ecf8e" : "#f0616d" }} />)}</div>
          {s.avgScore !== null && <div className="mt-3 flex items-center gap-2 text-xs text-muted">Ø Rating <b className="num text-white">{s.avgScore.toFixed(2)}</b></div>}
          {st <= -3 && <div className="mt-3 rounded-lg border border-loss/40 bg-loss/10 p-2 text-xs text-loss">🧊 {-st} Niederlagen in Folge – Tilt-Gefahr. Kurze Pause?</div>}
          {st >= 3 && <div className="mt-3 rounded-lg border border-win/40 bg-win/10 p-2 text-xs text-win">🔥 {st} Siege in Folge!</div>}
        </>
      ) : <p className="mt-3 text-sm text-muted">Gerade keine aktive Session. Sobald du spielst, siehst du hier deine Bilanz.</p>}
    </section>
  );
}

export function RadarCard({ items }: { items: MatchListItem[] }) {
  const r = useMemo(() => radar(items), [items]);
  if (!r) return null;
  const S = 220, c = S / 2, R = 78, n = r.values.length;
  const pt = (i: number, v: number) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; const k = (Math.min(v, 2) / 2) * R; return [c + Math.cos(a) * k, c + Math.sin(a) * k]; };
  const poly = r.values.map((v, i) => pt(i, v).join(",")).join(" ");
  return (
    <section className="surface p-5">
      <h3 className="label mb-1">Performance-Radar <span className="normal-case tracking-normal">· Ø letzte 20</span></h3>
      <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[250px]">
        {[0.5, 1, 1.5, 2].map((g) => <polygon key={g} points={r.values.map((_, i) => pt(i, g).join(",")).join(" ")} fill="none" stroke={g === 1 ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.08)"} strokeDasharray={g === 1 ? "3 3" : undefined} />)}
        {r.values.map((_, i) => <line key={i} x1={c} y1={c} x2={pt(i, 2)[0]} y2={pt(i, 2)[1]} stroke="rgba(255,255,255,.08)" />)}
        <polygon points={poly} fill="rgba(240,180,76,.28)" stroke="#f0b44c" strokeWidth="2" style={{ filter: "drop-shadow(0 0 6px #f0b44c88)" }} />
        {r.values.map((v, i) => <circle key={i} cx={pt(i, v)[0]} cy={pt(i, v)[1]} r="3.5" fill="#fff1c9" stroke="#f0b44c" />)}
        {r.labels.map((l, i) => { const [x, y] = pt(i, 2.45); return <text key={l} x={x} y={y + 3} textAnchor="middle" fontSize="9" fill="#8b94a8">{l}</text>; })}
      </svg>
      <p className="text-center text-[11px] text-muted">Gestrichelt = Lobby-Schnitt (1.00)</p>
    </section>
  );
}

export function ActivityHeatmap({ items }: { items: MatchListItem[] }) {
  const days = useMemo(() => activity(items, 20), [items]);
  const max = Math.max(1, ...days.map((d) => d.n));
  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const months = weeks.map((w, i) => (i === 0 || w[0].date.getMonth() !== weeks[i - 1][0].date.getMonth() ? w[0].date.toLocaleDateString("de-DE", { month: "short" }) : ""));
  return (
    <section className="surface p-5">
      <h3 className="label mb-3">Aktivität <span className="normal-case tracking-normal">· Matches pro Tag, Farbe = Winrate</span></h3>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="h-3 text-[9px] text-muted">{months[i]}</span>
            {w.map((d, j) => {
              const wr = d.n ? d.wins / d.n : 0;
              const base = d.n ? (wr >= 0.5 ? "62,207,142" : "240,97,109") : "255,255,255";
              return <span key={j} title={`${d.date.toLocaleDateString("de-DE")}: ${d.n} Matches${d.n ? `, ${d.wins} Siege` : ""}`} className="h-4 w-4 rounded-[4px] transition hover:scale-125"
                style={{ background: `rgba(${base},${d.n ? 0.25 + (d.n / max) * 0.7 : 0.05})` }} />;
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

export function RecordsCard({ items }: { items: MatchListItem[] }) {
  const recs = useMemo(() => records(items), [items]);
  const best = longestWinStreak(items);
  if (!recs.length) return null;
  return (
    <section className="surface overflow-hidden">
      <h3 className="label px-5 pt-5">Persönliche Rekorde</h3>
      <div className="mt-2">
        {recs.map((r) => (
          <NavLink key={r.key} href={`/match/${r.matchId}`} className="flex items-center gap-3 border-t border-white/[0.05] px-5 py-2 transition hover:bg-white/[0.04]">
            <HeroPortrait id={r.heroId} size={28} variant="small" className="!rounded-lg" />
            <span className="flex-1 text-sm text-muted">{r.label}</span>
            <span className="display num font-bold">{r.value}</span>
          </NavLink>
        ))}
        <div className="flex items-center gap-3 border-t border-white/[0.05] px-5 py-2"><span className="w-7 text-center">🔥</span><span className="flex-1 text-sm text-muted">Längste Siegesserie</span><span className="display num font-bold">{best}</span></div>
      </div>
    </section>
  );
}

export function InsightsCard({ items }: { items: MatchListItem[] }) {
  const heroName = useHeroName();
  const list = useMemo(() => insights(items, heroName), [items, heroName]);
  if (!list.length) return null;
  const col = { good: "#3ecf8e", bad: "#f0616d", info: "#4aa3ff" };
  return (
    <section className="surface p-5">
      <h3 className="label mb-3">Erkenntnisse</h3>
      <div className="space-y-2.5">
        {list.map((i, k) => (
          <div key={k} className="fade-up flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm" style={{ animationDelay: `${k * 70}ms`, borderLeft: `3px solid ${col[i.tone]}` }}>
            <span className="text-lg leading-none">{i.icon}</span><span className="text-white/90">{i.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BucketBars({ title, buckets, hint }: { title: string; buckets: Bucket[]; hint?: string }) {
  return (
    <section className="surface p-5">
      <h3 className="label mb-1">{title}</h3>
      {hint && <p className="mb-3 text-[11px] text-muted">{hint}</p>}
      <div className="mt-3 flex h-40 items-end gap-2">
        {buckets.map((b) => {
          const wr = b.n ? b.wins / b.n : 0;
          const col = !b.n ? "rgba(255,255,255,.08)" : wr >= 0.5 ? "linear-gradient(180deg,#3ecf8e,#1d8a5c)" : "linear-gradient(180deg,#f0616d,#a02535)";
          return (
            <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5" title={`${b.wins}/${b.n} Siege`}>
              <span className="num text-xs font-semibold">{b.n ? `${Math.round(wr * 100)}%` : "–"}</span>
              <div className="w-full rounded-t-lg transition-all duration-700" style={{ height: `${b.n ? Math.max(6, wr * 100 * 0.9) : 4}px`, background: col, opacity: Math.min(1, 0.4 + b.n / 8) }} />
              <span className="text-[10px] text-muted">{b.label}</span>
              <span className="num text-[9px] text-muted">{b.n}×</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function LobbyTile({ items, myBadge }: { items: MatchListItem[]; myBadge: number | null }) {
  const lin = avgLobby(items);
  const badge = lin === null ? null : linearToBadge(lin);
  return (
    <div className="surface surface-hover p-4">
      <div className="label">Ø Lobby-Rang</div>
      <div className="display mt-1 text-2xl font-extrabold">{badge ? formatBadge(badge) : "–"}</div>
      <div className="mt-0.5 text-xs text-muted">{badge ? "Schnitt der letzten 20 Matches" : "Sobald Match-Details da sind"}{myBadge && badge ? ` · du: ${formatBadge(myBadge)}` : ""}</div>
    </div>
  );
}

export function AchievementGrid({ items }: { items: MatchListItem[] }) {
  const list = useMemo(() => buildAch(items), [items]);
  const done = list.filter((a) => a.progress >= a.target).length;
  return (
    <>
      <div className="text-sm text-muted">{done} von {list.length} freigeschaltet</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((a, i) => {
          const ok = a.progress >= a.target;
          return (
            <div key={a.key} className={`surface fade-up p-4 ${ok ? "" : "opacity-80"}`} style={{ animationDelay: `${i * 40}ms`, boxShadow: ok ? "0 0 0 1px #f0b44c66, 0 18px 40px -26px #f0b44c" : undefined }}>
              <div className="flex items-center gap-3">
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${ok ? "sheen bg-amber/20" : "bg-white/[0.05] grayscale"}`}>{a.icon}</span>
                <div className="min-w-0"><div className="display font-bold">{a.title}</div><div className="text-xs text-muted">{a.desc}</div></div>
                {ok && <span className="ml-auto text-amber">✓</span>}
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${(a.progress / a.target) * 100}%`, background: ok ? "linear-gradient(90deg,#f0b44c,#fff1c9)" : "linear-gradient(90deg,#4aa3ff,#2a62b8)" }} /></div>
              <div className="num mt-1 text-right text-[11px] text-muted">{Math.round(a.progress * 10) / 10} / {a.target}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export { GradeBadge };
