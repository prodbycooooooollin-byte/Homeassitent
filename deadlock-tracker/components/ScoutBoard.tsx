"use client";
import { Avatar, HeroPortrait, RankEmblem, useHero, useHeroName, useTilt } from "./GameAssets";
import { Icon, type IconName } from "./Icon";
import { HoverCard } from "./Popover";
import { fmtK } from "@/lib/format";
import { formatBadge } from "@/lib/ranks";
import { gamePlan, reasonFor, threatScore, type ScoutPlayer, type ScoutTag, type TagTone } from "@/lib/live";
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

/** Zwei Teams + Stärkevergleich + Matchups + Hinweise. */
export function ScoutBoard({ r, match }: { r: ScoutResult; match?: LiveMatchMeta }) {
  const heroName = useHeroName();
  const mine = r.players.filter((p) => p.team === r.myTeam).sort((a, b) => Number(b.isMe) - Number(a.isMe));
  const enemy = r.players.filter((p) => p.team !== r.myTeam);
  const A = r.teams[r.myTeam], B = r.teams[r.myTeam === 0 ? 1 : 0];
  const wc = r.winChance;
  const nw = match?.netWorth;
  const myNw = nw ? nw[r.myTeam] : null, enNw = nw ? nw[r.myTeam === 0 ? 1 : 0] : null;
  return (
    <div className="space-y-3">
      {/* Stärkevergleich */}
      <section className="surface p-3.5">
        <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
          <TeamHead title="Dein Team" color={COL[r.myTeam]} s={A} />
          <div className="min-w-[220px] text-center">
            {wc !== null ? (
              <>
                <div className="label !text-[9px]">Geschätzte Gewinnchance</div>
                <div className="display num text-3xl font-extrabold leading-none" style={{ color: wc >= 0.5 ? "#3ecf8e" : "#f0616d" }}>{Math.round(wc * 100)}%</div>
                <div className="mx-auto mt-1.5 flex h-2 w-56 overflow-hidden rounded-full"><div style={{ width: `${wc * 100}%`, background: COL[r.myTeam] }} /><div style={{ width: `${(1 - wc) * 100}%`, background: COL[r.myTeam === 0 ? 1 : 0], opacity: 0.8 }} /></div>
                
              </>
            ) : <div className="text-sm text-muted">Gewinnchance nicht berechenbar</div>}
          </div>
          <TeamHead title="Gegner" color={COL[r.myTeam === 0 ? 1 : 0]} s={B} right />
        </div>
        {(nw || match?.objectives) && (
          <div className="mt-3 flex flex-wrap gap-x-10 gap-y-2 border-t border-white/[0.07] pt-3 text-sm">
            {myNw !== null && enNw !== null && <Live label="Team-Souls" a={fmtK(myNw)} b={fmtK(enNw)} lead={myNw - enNw} unit="Souls" />}
            {match?.objectives && <Live label="Objectives zerstört" a={String(match.objectives[r.myTeam])} b={String(match.objectives[r.myTeam === 0 ? 1 : 0])} lead={match.objectives[r.myTeam] - match.objectives[r.myTeam === 0 ? 1 : 0]} />}
          </div>
        )}
      </section>

      <GamePlanCards r={r} />

      <section className="surface overflow-hidden">
        <div className="grid grid-cols-2 border-b border-white/[0.07] px-4 py-2.5">
          <h2 className="display text-sm font-bold" style={{ color: COL[r.myTeam] }}>Dein Team</h2>
          <h2 className="display text-right text-sm font-bold" style={{ color: COL[r.myTeam === 0 ? 1 : 0] }}>Gegner <span className="label !text-[9px] !text-muted">· nach Stärke sortiert</span></h2>
        </div>
        {Array.from({ length: Math.max(mine.length, enemy.length) }, (_, i) => {
          const a = [...mine].sort((x, y) => threatScore(y) - threatScore(x))[i], b = [...enemy].sort((x, y) => threatScore(y) - threatScore(x))[i];
          return (
            <div key={i} className="grid divide-x divide-white/[0.05] border-b border-white/[0.05] last:border-0 lg:grid-cols-2">
              {a ? <ScoutRow p={a} /> : <div />}
              {b ? <ScoutRow p={b} flip /> : <div />}
            </div>
          );
        })}
      </section>

      {r.insights.length > 0 && (
        <section className="surface p-4">
          <h2 className="label mb-2 flex items-center gap-1.5"><Icon name="eye" size={13} />Auf einen Blick</h2>
          <div className="grid gap-1.5 md:grid-cols-2">{r.insights.map((t, i) => <div key={i} className="flex items-start gap-2 text-sm text-muted"><Icon name="target" size={14} className="mt-0.5 shrink-0 text-amber" />{t}</div>)}</div>
        </section>
      )}

      {r.matchups.length > 0 && (
        <section className="surface p-5">
          <h2 className="label mb-3">Dein Held gegen die Gegner <span className="normal-case tracking-normal">· globale Ranked-Winrate der letzten 3 Wochen</span></h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{r.matchups.map((m) => (
            <div key={m.heroId} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-center">
              <div className="mx-auto w-fit"><HeroPortrait id={m.heroId} size={44} variant="small" ring={m.wr >= 0.5 ? "#3ecf8e" : "#f0616d"} /></div>
              <div className="mt-1.5 truncate text-xs font-semibold">{heroName(m.heroId)}</div>
              <div className="num text-lg font-extrabold" style={{ color: m.wr >= 0.5 ? "#3ecf8e" : "#f0616d" }}>{Math.round(m.wr * 100)}%</div>
              <div className="num text-[10px] text-muted">{m.matches.toLocaleString("de-DE")} Matches</div>
            </div>))}</div>
        </section>
      )}
      {r.missing > 0 && <p className="text-center text-xs text-muted">Für {r.missing} Spieler konnte keine Historie geladen werden (privates Profil oder Rate-Limit).</p>}
    </div>
  );
}

function TeamHead({ title, color, s, right }: { title: string; color: string; s: ScoutResult["teams"][number]; right?: boolean }) {
  return (
    <div className={right ? "md:text-right" : ""}>
      <div className="display text-base font-extrabold" style={{ color }}>{title}</div>
      <div className={`mt-1 flex items-center gap-2 ${right ? "md:justify-end" : ""}`}><RankEmblem badge={s.avgBadge ? Math.round(s.avgBadge) : null} size={30} /><span className="text-sm text-muted">Ø {s.avgBadge ? formatBadge(Math.round(s.avgBadge)) : "–"}</span></div>
      <div className="num text-xs text-muted">{s.avgWr !== null ? `Ø Winrate ${Math.round(s.avgWr * 100)}%` : "Keine Winrate-Daten"}{s.avgGames !== null ? ` · Ø ${Math.round(s.avgGames)} Matches` : ""}</div>
    </div>
  );
}

function Live({ label, a, b, lead, unit = "" }: { label: string; a: string; b: string; lead: number; unit?: string }) {
  return <div><div className="label !text-[9px]">{label}</div><div className="display num text-xl font-bold"><span className="text-amber">{a}</span> <span className="text-muted">:</span> <span className="text-sapphire">{b}</span></div><div className="num text-[11px]" style={{ color: lead >= 0 ? "#3ecf8e" : "#f0616d" }}>{lead === 0 ? "gleichauf" : `${lead > 0 ? "+" : ""}${unit === "Souls" ? fmtK(lead) : lead} ${unit}`}</div></div>;
}


const PRIO = ["smurf", "firstever", "firsthero", "newbie", "tilt", "main", "heroweak", "herostrong", "hot", "aggressive", "efficient", "veteran", "careful", "assist", "fewhero", "nodata"];

/** Kompakte Zeile für den Zweitmonitor: alles Wichtige zu einem Spieler in einer Zeile. */
export function ScoutRow({ p, flip }: { p: ScoutPlayer; flip?: boolean }) {
  const heroName = useHeroName();
  const { color } = useHero(p.heroId || undefined);
  const c = p.isMe ? "#f0b44c" : COL[p.team];
  const t = threatScore(p);
  const tags = [...p.tags].sort((a, b) => PRIO.indexOf(a.key) - PRIO.indexOf(b.key));
  const tcol = t >= 65 ? "#f0616d" : t >= 45 ? "#f0b44c" : "#3ecf8e";
  return (
    <div className={`relative flex items-center gap-3 px-4 py-2.5 ${flip ? "flex-row-reverse text-right" : ""} ${p.isMe ? "bg-amber/[0.06]" : ""}`}>
      <span className="absolute inset-y-1 w-[3px] rounded" style={{ [flip ? "right" : "left"]: 0, background: c } as React.CSSProperties} />
      {p.heroId > 0 ? <HeroPortrait id={p.heroId} size={44} h={54} ring={color} /> : <Avatar src={p.avatar} name={p.name ?? "?"} size={44} ring={c} />}
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1.5 ${flip ? "flex-row-reverse" : ""}`}>
          <span className="truncate text-sm font-bold">{p.isMe ? "Du" : p.name ?? (p.accountId ? `Spieler ${p.accountId}` : "Unbekannt")}</span>
          {p.heroId > 0 && <span className="truncate text-xs text-muted">{heroName(p.heroId)}</span>}
        </div>
        <div className={`mt-1 flex flex-wrap items-center gap-1 ${flip ? "justify-end" : ""}`}>
          {tags.slice(0, 3).map((x) => <TagChip key={x.key} t={x} />)}
          {tags.length > 3 && <HoverCard width={230} content={<div className="space-y-1 text-xs">{tags.slice(3).map((x) => <div key={x.key}><b>{x.label}</b> <span className="text-muted">– {x.tip}</span></div>)}</div>}><span className="cursor-help rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-muted">+{tags.length - 3}</span></HoverCard>}
          {p.recent.length > 0 && <span className="ml-1 flex gap-0.5">{p.recent.slice(0, 6).map((w, i) => <i key={i} className="h-2 w-1.5 rounded-sm" style={{ background: w ? "#3ecf8e" : "#f0616d", opacity: 1 - i * 0.1 }} />)}</span>}
        </div>
      </div>
      <div className="hidden w-[92px] shrink-0 grid-cols-2 gap-x-2 text-center xl:grid">
        <Mini l="WR" v={p.wr === null ? "–" : `${Math.round(p.wr * 100)}%`} c={p.wr === null ? undefined : p.wr >= 0.55 ? "#3ecf8e" : p.wr < 0.45 ? "#f0616d" : undefined} />
        <Mini l="KDA" v={p.kda === null ? "–" : p.kda.toFixed(1)} />
        <Mini l="Held" v={p.heroId > 0 ? (p.heroGames === null ? "–" : `${p.heroGames}×`) : "–"} />
        <Mini l="Spiele" v={p.games === null ? "–" : String(p.games)} />
      </div>
      <HoverCard width={240} content={<div className="text-xs"><div className="mb-1 font-semibold">Stärke-Wert {t}/100</div><p className="text-muted">Aus Rang, Winrate, Routine auf dem Helden, KDA und aktueller Form. {reasonFor(p)}.</p></div>}>
        <div className="flex w-14 shrink-0 cursor-help flex-col items-center gap-1">
          <RankEmblem badge={p.badge} size={30} />
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full" style={{ width: `${t}%`, background: tcol }} /></div>
        </div>
      </HoverCard>
    </div>
  );
}
function Mini({ l, v, c }: { l: string; v: string; c?: string }) {
  return <div><div className="num text-xs font-bold" style={{ color: c }}>{v}</div><div className="text-[8px] uppercase tracking-wider text-muted">{l}</div></div>;
}

/** Spielplan: wen unter Druck setzen, vor wem Vorsicht, wem im Team helfen – plus Stärkebalken beider Teams. */
function GamePlanCards({ r }: { r: ScoutResult }) {
  const plan = gamePlan(r.players, r.myTeam);
  const heroName = useHeroName();
  const total = plan.power[0] + plan.power[1] || 1;
  const mineP = plan.power[r.myTeam], enP = plan.power[r.myTeam === 0 ? 1 : 0];
  const Card = ({ title, icon, color, p, text }: { title: string; icon: IconName; color: string; p: ScoutPlayer | null; text: string }) => (
    <div className="surface flex items-center gap-3 p-3" style={{ borderColor: `${color}44` }}>
      {p ? (p.heroId > 0 ? <HeroPortrait id={p.heroId} size={46} h={56} ring={color} /> : <Avatar src={p.avatar} name={p.name ?? "?"} size={46} ring={color} />) : <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: `${color}22`, color }}><Icon name={icon} size={20} /></span>}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color }}><Icon name={icon} size={12} />{title}</div>
        <div className="truncate text-sm font-bold">{p ? `${p.name ?? "Spieler"}${p.heroId > 0 ? ` · ${heroName(p.heroId)}` : ""}` : "–"}</div>
        <div className="truncate text-xs text-muted">{p ? reasonFor(p) : text}</div>
      </div>
    </div>
  );
  return (
    <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Card title="Fokus-Ziel" icon="target" color="#3ecf8e" p={plan.target} text="Zu wenig Daten" />
        <Card title="Größte Gefahr" icon="flame" color="#f0616d" p={plan.threat} text="Zu wenig Daten" />
        <Card title="Schwachstelle im Team" icon="shield" color="#f0b44c" p={plan.weak} text="Zu wenig Daten" />
      </div>
      <div className="surface flex flex-wrap items-center gap-x-6 gap-y-2 p-3">
        <div className="min-w-[240px] flex-1">
          <div className="mb-1 flex justify-between text-[10px] uppercase tracking-widest text-muted"><span>Team-Stärke {mineP}</span><span>{enP} Gegner</span></div>
          <div className="flex h-2 overflow-hidden rounded-full"><div style={{ width: `${(mineP / total) * 100}%`, background: COL[r.myTeam] }} /><div style={{ width: `${(enP / total) * 100}%`, background: COL[r.myTeam === 0 ? 1 : 0], opacity: 0.8 }} /></div>
        </div>
        {plan.tips.length > 0 && <ul className="min-w-[260px] flex-[2] space-y-0.5 text-sm text-muted">{plan.tips.map((t, i) => <li key={i} className="flex gap-2"><Icon name="arrowRight" size={13} className="mt-1 shrink-0 text-amber" />{t}</li>)}</ul>}
      </div>
    </section>
  );
}
