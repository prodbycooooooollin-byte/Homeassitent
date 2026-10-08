"use client";
import { Avatar, HeroPortrait, RankEmblem, useHero, useHeroName, useTilt } from "./GameAssets";
import { Icon, type IconName } from "./Icon";
import { HoverCard } from "./Popover";
import { fmtDuration, fmtK } from "@/lib/format";
import { formatBadge } from "@/lib/ranks";
import { carryShare, duelPairs, gamePlan, reasonFor, threatScore, type ScoutPlayer, type ScoutTag, type TagTone } from "@/lib/live";
import type { ScoutResult } from "@/lib/scout";

const TONE: Record<TagTone, { c: string; bg: string }> = {
  good: { c: "#3ecf8e", bg: "rgba(62,207,142,.12)" },
  bad: { c: "#f0616d", bg: "rgba(240,97,109,.12)" },
  warn: { c: "#f0b44c", bg: "rgba(240,180,76,.12)" },
  info: { c: "#8fb4ff", bg: "rgba(74,163,255,.12)" },
};
// Aus Sicht des Betrachters: Tags eines GEGNERS mit Warnungen sind „schlecht für dich“ – die Töne sind bereits so gewählt.
const COL = ["#f0b44c", "#4aa3ff"];

export interface LiveMatchMeta { id: number; durationS?: number; mode?: string; netWorth?: [number, number] | null; objectives?: [number, number] | null; winningTeam?: 0 | 1 | null }

export function TagChip({ t }: { t: ScoutTag }) {
  const tone = TONE[t.tone];
  return (
    <HoverCard width={250} content={<div className="text-xs leading-relaxed"><div className="mb-1 flex items-center gap-1.5 font-semibold" style={{ color: tone.c }}><Icon name={t.icon as IconName} size={13} />{t.label}</div><p className="text-muted">{t.tip}</p></div>}>
      <span className="inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition hover:brightness-125" style={{ color: tone.c, background: tone.bg, borderColor: `${tone.c}44` }}>
        <Icon name={t.icon as IconName} size={11} />{t.label}
      </span>
    </HoverCard>
  );
}

export function ScoutCard({ p, flip }: { p: ScoutPlayer; flip?: boolean }) {
  const heroName = useHeroName();
  const { color } = useHero(p.heroId || undefined);
  const tilt = useTilt(4);
  const c = p.isMe ? "#f0b44c" : COL[p.team];
  return (
    <div {...tilt} className="tilt surface relative overflow-hidden p-3.5" style={{ boxShadow: p.isMe ? "0 0 0 1px #f0b44c99, 0 14px 40px -24px #f0b44c" : `0 0 0 1px ${c}22` }}>
      <span className="shine" />
      <div className="pointer-events-none absolute inset-y-0 w-1" style={{ [flip ? "right" : "left"]: 0, background: c, boxShadow: `0 0 14px ${c}` } as React.CSSProperties} />
      <div className={`flex gap-3 ${flip ? "flex-row-reverse text-right" : ""}`}>
        {p.heroId > 0 ? <HeroPortrait id={p.heroId} size={60} h={76} ring={color} /> : <Avatar src={p.avatar} name={p.name ?? "?"} size={60} ring={c} />}
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-2 ${flip ? "flex-row-reverse" : ""}`}>
            <Avatar src={p.avatar} name={p.name ?? "?"} size={24} ring={`${c}66`} />
            <span className="truncate font-bold">{p.isMe ? "Du" : p.name ?? (p.accountId ? `Spieler ${p.accountId}` : "Unbekannt")}</span>
          </div>
          {p.heroId > 0 && <div className="truncate text-xs text-muted">{heroName(p.heroId)}</div>}
          <div className={`mt-1 flex items-center gap-2 ${flip ? "flex-row-reverse" : ""}`}>
            <RankEmblem badge={p.badge} size={26} />
            <span className="text-xs text-muted">{p.badge ? formatBadge(p.badge) : "Rang unbekannt"}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
        <Stat label="Matches" v={p.games === null ? "–" : String(p.games)} />
        <Stat label="Winrate" v={p.wr === null ? "–" : `${Math.round(p.wr * 100)}%`} tone={p.wr === null ? undefined : p.wr >= 0.55 ? "#3ecf8e" : p.wr < 0.45 ? "#f0616d" : undefined} />
        <Stat label="KDA" v={p.kda === null ? "–" : p.kda.toFixed(1)} />
        <Stat label={p.heroId > 0 ? "Held" : "Top-Held"} v={p.heroId > 0 ? (p.heroGames === null ? "–" : `${p.heroGames}×`) : p.topHeroes[0] ? `${p.topHeroes[0].games}×` : "–"} />
      </div>
      {p.tags.length > 0 && <div className={`mt-2.5 flex flex-wrap gap-1.5 ${flip ? "justify-end" : ""}`}>{p.tags.map((t) => <TagChip key={t.key} t={t} />)}</div>}
      {p.heroId <= 0 && p.topHeroes.length > 0 && (
        <div className="mt-3 flex gap-2">{p.topHeroes.map((h) => <div key={h.heroId} className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] p-1 pr-2"><HeroPortrait id={h.heroId} size={26} variant="small" className="!rounded-md" /><span className="num text-[10px] text-muted">{h.games}× · {Math.round(h.wr * 100)}%</span></div>)}</div>
      )}
      {p.recent.length > 0 && <div className={`mt-2.5 flex items-center gap-1 ${flip ? "flex-row-reverse" : ""}`}><span className="label !text-[9px]">Form</span>{p.recent.map((w, i) => <i key={i} className="h-2 w-2 rounded-sm" style={{ background: w ? "#3ecf8e" : "#f0616d", opacity: 1 - i * 0.08 }} />)}</div>}
    </div>
  );
}

function Stat({ label, v, tone }: { label: string; v: string; tone?: string }) {
  return <div className="rounded-lg bg-white/[0.04] py-1"><div className="num text-sm font-bold" style={{ color: tone }}>{v}</div><div className="text-[9px] uppercase tracking-wider text-muted">{label}</div></div>;
}


const PRIO = ["smurf", "firstever", "firsthero", "newbie", "tilt", "main", "heroweak", "herostrong", "hot", "aggressive", "efficient", "veteran", "careful", "assist", "fewhero", "nodata"];
const other = (t: 0 | 1): 0 | 1 => (t === 0 ? 1 : 0);
const wrCol = (wr: number | null) => (wr === null ? undefined : wr >= 0.55 ? "#3ecf8e" : wr < 0.45 ? "#f0616d" : undefined);

/** Zweitmonitor-Ansicht: Kopfleiste, Spielplan, sechs Duelle – alles ohne Scrollen. */
export function ScoutBoard({ r, match, live }: { r: ScoutResult; match?: LiveMatchMeta; live?: boolean }) {
  const en = other(r.myTeam);
  const pairs = duelPairs(r.players, r.myTeam);
  const mu = new Map(r.matchups.map((m) => [m.heroId, m]));
  return (
    <div className="space-y-2">
      <HeadBar r={r} match={match} live={live} />
      <GamePlanCards r={r} />
      <section className="surface overflow-hidden">
        <div className="grid grid-cols-[1fr_52px_1fr] border-b border-white/[0.07] px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
          <span style={{ color: COL[r.myTeam] }}>Dein Team</span>
          <span className="text-center font-normal text-muted">Δ</span>
          <span className="text-right" style={{ color: COL[en] }}>Gegner</span>
        </div>
        {pairs.map((d, i) => (
          <div key={i} className="grid grid-cols-[1fr_52px_1fr] items-center border-b border-white/[0.05] last:border-0">
            {d.mine ? <ScoutRow p={d.mine} /> : <div />}
            <Delta diff={d.diff} />
            {d.enemy ? <ScoutRow p={d.enemy} flip vs={mu.get(d.enemy.heroId)} /> : <div />}
          </div>
        ))}
      </section>
    </div>
  );
}

/** Schmale Kopfleiste (~56 px): Live/Zeit, Team-Ø-Rang, Gewinnchance, Souls, Objectives, Info. */
function HeadBar({ r, match, live }: { r: ScoutResult; match?: LiveMatchMeta; live?: boolean }) {
  const en = other(r.myTeam);
  const A = r.teams[r.myTeam], B = r.teams[en];
  const wc = r.winChance;
  const nw = match?.netWorth, ob = match?.objectives;
  const carryA = carryShare(r.players, r.myTeam), carryB = carryShare(r.players, en);
  const name = (p: ScoutPlayer) => (p.isMe ? "Du" : p.name ?? "Spieler");
  const diff = (a: number, b: number, fmt: (n: number) => string) => <span className="num text-[11px]" style={{ color: a === b ? undefined : a > b ? "#3ecf8e" : "#f0616d" }}>{a === b ? "±0" : `${a > b ? "+" : "−"}${fmt(Math.abs(a - b))}`}</span>;
  return (
    <section className="surface flex h-14 items-center gap-4 px-3">
      <div className="flex shrink-0 items-center gap-2">
        {live ? <><span className="live-pulse" /><span className="display text-xs font-extrabold uppercase tracking-[0.2em] text-loss">Live</span></> : <span className="chip">Letztes Match</span>}
        {match?.durationS !== undefined && <span className="display num text-lg font-bold">{fmtDuration(match.durationS)}</span>}
      </div>
      <TeamRank color={COL[r.myTeam]} s={A} />
      <div className="min-w-[200px] flex-1">
        {wc !== null ? (
          <>
            <div className="mb-0.5 flex items-baseline justify-between"><span className="num text-sm font-extrabold" style={{ color: COL[r.myTeam] }}>{Math.round(wc * 100)}%</span><span className="text-[9px] uppercase tracking-widest text-muted">Gewinnchance</span><span className="num text-sm font-extrabold" style={{ color: COL[en] }}>{Math.round((1 - wc) * 100)}%</span></div>
            <div className="flex h-1.5 overflow-hidden rounded-full"><div style={{ width: `${wc * 100}%`, background: COL[r.myTeam] }} /><div style={{ width: `${(1 - wc) * 100}%`, background: COL[en], opacity: 0.8 }} /></div>
          </>
        ) : <div className="text-center text-xs text-muted">Gewinnchance nicht berechenbar</div>}
      </div>
      <TeamRank color={COL[en]} s={B} right />
      {nw && <div className="shrink-0 text-center"><div className="text-[9px] uppercase tracking-widest text-muted">Souls</div>{diff(nw[r.myTeam], nw[en], fmtK)}</div>}
      {ob && <div className="shrink-0 text-center"><div className="text-[9px] uppercase tracking-widest text-muted">Objectives</div><div className="num text-xs font-bold"><span className="text-amber">{ob[r.myTeam]}</span><span className="text-muted"> : </span><span className="text-sapphire">{ob[en]}</span></div></div>}
      <HoverCard width={290} content={
        <div className="space-y-1.5 text-xs">
          <div className="font-semibold">Wer trägt wen</div>
          {carryA && <div><span className="text-muted">Dein Team:</span> {name(carryA.player)} trägt {Math.round(carryA.share * 100)}% der Stärke{carryA.share >= 0.28 ? " – steht und fällt mit ihm" : " – ausgeglichen"}.</div>}
          {carryB && <div><span className="text-muted">Gegner:</span> {name(carryB.player)} trägt {Math.round(carryB.share * 100)}% der Stärke{carryB.share >= 0.28 ? " – Ausschalten bricht das Team" : " – ausgeglichen"}.</div>}
          {A.avgWr !== null && B.avgWr !== null && <div className="text-muted">Ø Winrate {Math.round(A.avgWr * 100)}% gegen {Math.round(B.avgWr * 100)}%.</div>}
          {r.insights.slice(0, 4).map((t, i) => <div key={i} className="text-muted">{t}</div>)}
          {r.missing > 0 && <div className="text-warn">Für {r.missing} Spieler fehlt die Historie (privat oder Rate-Limit).</div>}
          <div className="text-[10px] text-muted">Stärke-Wert und Gewinnchance sind Schätzungen aus Rang, Winrate, Heldenroutine und Form.</div>
        </div>}>
        <span className="flex h-7 w-7 shrink-0 cursor-help items-center justify-center rounded-full border border-white/10 text-muted"><Icon name="eye" size={14} /></span>
      </HoverCard>
    </section>
  );
}

function TeamRank({ color, s, right }: { color: string; s: ScoutResult["teams"][number]; right?: boolean }) {
  return (
    <div className={`flex shrink-0 items-center gap-2 ${right ? "flex-row-reverse text-right" : ""}`}>
      <RankEmblem badge={s.avgBadge ? Math.round(s.avgBadge) : null} size={28} />
      <div><div className="text-[9px] uppercase tracking-widest" style={{ color }}>Ø Rang</div><div className="num text-xs font-bold">{s.avgBadge ? formatBadge(Math.round(s.avgBadge)) : "–"}</div></div>
    </div>
  );
}

/** Stärke-Differenz eines Duells aus deiner Sicht. */
function Delta({ diff }: { diff: number | null }) {
  if (diff === null) return <span className="text-center text-xs text-muted">–</span>;
  const c = Math.abs(diff) < 5 ? "#9aa3b2" : diff > 0 ? "#3ecf8e" : "#f0616d";
  return <span className="num mx-auto rounded-md px-1.5 py-0.5 text-xs font-extrabold" style={{ color: c, background: `${c}1f` }}>{diff > 0 ? "+" : diff < 0 ? "−" : "±"}{Math.abs(diff)}</span>;
}

/** Kompakte Duell-Zeile (~54 px): Porträt, Name, Rang, 2 Tags (+n), Zahlen, Stärke-Balken. */
export function ScoutRow({ p, flip, vs }: { p: ScoutPlayer; flip?: boolean; vs?: { wr: number; matches: number } }) {
  const heroName = useHeroName();
  const { color } = useHero(p.heroId || undefined);
  const c = p.isMe ? "#f0b44c" : COL[p.team];
  const t = threatScore(p);
  const tags = [...p.tags].sort((a, b) => PRIO.indexOf(a.key) - PRIO.indexOf(b.key));
  const tcol = t >= 65 ? "#f0616d" : t >= 45 ? "#f0b44c" : "#3ecf8e";
  return (
    <div className={`relative flex h-[54px] items-center gap-2.5 px-3 ${flip ? "flex-row-reverse text-right" : ""} ${p.isMe ? "bg-amber/[0.06]" : ""}`}>
      <span className="absolute inset-y-1.5 w-[3px] rounded" style={{ [flip ? "right" : "left"]: 0, background: c } as React.CSSProperties} />
      {p.heroId > 0 ? <HeroPortrait id={p.heroId} size={36} h={44} ring={color} /> : <Avatar src={p.avatar} name={p.name ?? "?"} size={36} ring={c} />}
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1.5 ${flip ? "flex-row-reverse" : ""}`}>
          <span className="truncate text-sm font-bold">{p.isMe ? "Du" : p.name ?? (p.accountId ? `Spieler ${p.accountId}` : "Unbekannt")}</span>
          {p.heroId > 0 && <span className="truncate text-[11px] text-muted">{heroName(p.heroId)}</span>}
        </div>
        <div className={`mt-0.5 flex items-center gap-1 ${flip ? "flex-row-reverse" : ""}`}>
          {tags.slice(0, 2).map((x) => <TagChip key={x.key} t={x} />)}
          {tags.length > 2 && <HoverCard width={230} content={<div className="space-y-1 text-xs">{tags.slice(2).map((x) => <div key={x.key}><b>{x.label}</b> <span className="text-muted">– {x.tip}</span></div>)}</div>}><span className="cursor-help rounded-full border border-white/10 px-1.5 text-[10px] text-muted">+{tags.length - 2}</span></HoverCard>}
        </div>
      </div>
      <div className="hidden shrink-0 grid-cols-3 gap-x-2.5 text-center xl:grid">
        <Mini l="WR" v={p.wr === null ? "–" : `${Math.round(p.wr * 100)}%`} c={wrCol(p.wr)} />
        <Mini l="KDA" v={p.kda === null ? "–" : p.kda.toFixed(1)} />
        <Mini l="Held" v={p.heroId > 0 && p.heroGames !== null ? `${p.heroGames}×` : "–"} />
      </div>
      {vs && (
        <HoverCard width={220} content={<div className="text-xs">Globale Ranked-Winrate deines Helden gegen {heroName(p.heroId)} (letzte 3 Wochen, {vs.matches.toLocaleString("de-DE")} Matches).</div>}>
          <div className="shrink-0 cursor-help text-center"><div className="num text-xs font-bold" style={{ color: vs.wr >= 0.5 ? "#3ecf8e" : "#f0616d" }}>{Math.round(vs.wr * 100)}%</div><div className="text-[8px] uppercase tracking-wider text-muted">Matchup</div></div>
        </HoverCard>
      )}
      <HoverCard width={240} content={<div className="text-xs"><div className="mb-1 font-semibold">Stärke-Wert {t}/100</div><p className="text-muted">Aus Rang, Winrate, Routine auf dem Helden, KDA und aktueller Form. {reasonFor(p)}.</p></div>}>
        <div className="flex w-12 shrink-0 cursor-help flex-col items-center gap-0.5">
          <RankEmblem badge={p.badge} size={24} />
          <div className="flex w-full items-center gap-1"><div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full" style={{ width: `${t}%`, background: tcol }} /></div><span className="num text-[9px] text-muted">{t}</span></div>
        </div>
      </HoverCard>
    </div>
  );
}
function Mini({ l, v, c }: { l: string; v: string; c?: string }) {
  return <div><div className="num text-xs font-bold" style={{ color: c }}>{v}</div><div className="text-[8px] uppercase tracking-wider text-muted">{l}</div></div>;
}

/** Spielplan in einer Zeile: Fokus-Ziel, Größte Gefahr, Schwachstelle – Tipps im Hover. */
function GamePlanCards({ r }: { r: ScoutResult }) {
  const plan = gamePlan(r.players, r.myTeam);
  const heroName = useHeroName();
  const Card = ({ title, icon, color, p }: { title: string; icon: IconName; color: string; p: ScoutPlayer | null }) => (
    <div className="surface flex h-[52px] min-w-0 items-center gap-2.5 px-2.5" style={{ borderColor: `${color}44` }}>
      {p ? (p.heroId > 0 ? <HeroPortrait id={p.heroId} size={32} h={40} ring={color} /> : <Avatar src={p.avatar} name={p.name ?? "?"} size={32} ring={color} />) : <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}22`, color }}><Icon name={icon} size={16} /></span>}
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest" style={{ color }}><Icon name={icon} size={11} />{title}</div>
        <div className="truncate text-xs font-bold">{p ? `${p.isMe ? "Du" : p.name ?? "Spieler"}${p.heroId > 0 ? ` · ${heroName(p.heroId)}` : ""}` : "–"} <span className="font-normal text-muted">{p ? reasonFor(p) : "Zu wenig Daten"}</span></div>
      </div>
    </div>
  );
  const cards = (
    <div className="grid gap-2 md:grid-cols-3">
      <Card title="Fokus-Ziel" icon="target" color="#3ecf8e" p={plan.target} />
      <Card title="Größte Gefahr" icon="flame" color="#f0616d" p={plan.threat} />
      <Card title="Schwachstelle" icon="shield" color="#f0b44c" p={plan.weak} />
    </div>
  );
  if (!plan.tips.length) return cards;
  return <HoverCard className="block" width={340} content={<ul className="space-y-1 text-xs">{plan.tips.map((t, i) => <li key={i} className="flex gap-1.5"><Icon name="arrowRight" size={12} className="mt-0.5 shrink-0 text-amber" />{t}</li>)}</ul>}>{cards}</HoverCard>;
}
