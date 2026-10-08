"use client";
import { Avatar, HeroPortrait, RankEmblem, useHero, useHeroName, useTilt } from "./GameAssets";
import { Icon, type IconName } from "./Icon";
import { HoverCard } from "./Popover";
import { fmtK } from "@/lib/format";
import { formatBadge } from "@/lib/ranks";
import type { ScoutPlayer, ScoutTag, TagTone } from "@/lib/live";
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
    <div className="space-y-5">
      {/* Stärkevergleich */}
      <section className="surface p-5">
        <div className="grid items-center gap-5 md:grid-cols-[1fr_auto_1fr]">
          <TeamHead title="Dein Team" color={COL[r.myTeam]} s={A} />
          <div className="min-w-[260px] text-center">
            {wc !== null ? (
              <>
                <div className="label !text-[9px]">Geschätzte Gewinnchance</div>
                <div className="display num text-4xl font-extrabold" style={{ color: wc >= 0.5 ? "#3ecf8e" : "#f0616d" }}>{Math.round(wc * 100)}%</div>
                <div className="mx-auto mt-1.5 flex h-2 w-56 overflow-hidden rounded-full"><div style={{ width: `${wc * 100}%`, background: COL[r.myTeam] }} /><div style={{ width: `${(1 - wc) * 100}%`, background: COL[r.myTeam === 0 ? 1 : 0], opacity: 0.8 }} /></div>
                <div className="mt-1 text-[10px] text-muted">Heuristik aus Rang, Winrate{r.matchups.length ? " und Held-Matchups" : ""}</div>
              </>
            ) : <div className="text-sm text-muted">Gewinnchance nicht berechenbar</div>}
          </div>
          <TeamHead title="Gegner" color={COL[r.myTeam === 0 ? 1 : 0]} s={B} right />
        </div>
        {(nw || match?.objectives) && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4 text-sm md:grid-cols-4">
            {myNw !== null && enNw !== null && <Live label="Team-Souls" a={fmtK(myNw)} b={fmtK(enNw)} lead={myNw - enNw} unit="Souls" />}
            {match?.objectives && <Live label="Objectives zerstört" a={String(match.objectives[r.myTeam])} b={String(match.objectives[r.myTeam === 0 ? 1 : 0])} lead={match.objectives[r.myTeam] - match.objectives[r.myTeam === 0 ? 1 : 0]} />}
          </div>
        )}
      </section>

      {r.insights.length > 0 && (
        <section className="surface p-5">
          <h2 className="label mb-3 flex items-center gap-1.5"><Icon name="eye" size={13} />Scouting-Zusammenfassung</h2>
          <div className="grid gap-2 md:grid-cols-2">{r.insights.map((t, i) => <div key={i} className="fade-up flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-sm" style={{ animationDelay: `${i * 50}ms` }}><Icon name="target" size={15} className="mt-0.5 shrink-0 text-amber" />{t}</div>)}</div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3"><h2 className="display text-lg font-bold" style={{ color: COL[r.myTeam] }}>Dein Team</h2>{mine.map((p, i) => <ScoutCard key={p.accountId + "-" + i} p={p} />)}</div>
        <div className="space-y-3"><h2 className="display text-lg font-bold lg:text-right" style={{ color: COL[r.myTeam === 0 ? 1 : 0] }}>Gegner</h2>{enemy.map((p, i) => <ScoutCard key={p.accountId + "-" + i} p={p} flip />)}</div>
      </div>

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
      <div className="display text-xl font-extrabold" style={{ color }}>{title}</div>
      <div className={`mt-1 flex items-center gap-2 ${right ? "md:justify-end" : ""}`}><RankEmblem badge={s.avgBadge ? Math.round(s.avgBadge) : null} size={30} /><span className="text-sm text-muted">Ø {s.avgBadge ? formatBadge(Math.round(s.avgBadge)) : "–"}</span></div>
      <div className="num mt-0.5 text-xs text-muted">{s.avgWr !== null ? `Ø Winrate ${Math.round(s.avgWr * 100)}%` : "Keine Winrate-Daten"}{s.avgGames !== null ? ` · Ø ${Math.round(s.avgGames)} Matches` : ""}</div>
    </div>
  );
}

function Live({ label, a, b, lead, unit = "" }: { label: string; a: string; b: string; lead: number; unit?: string }) {
  return <div><div className="label !text-[9px]">{label}</div><div className="display num text-xl font-bold"><span className="text-amber">{a}</span> <span className="text-muted">:</span> <span className="text-sapphire">{b}</span></div><div className="num text-[11px]" style={{ color: lead >= 0 ? "#3ecf8e" : "#f0616d" }}>{lead === 0 ? "gleichauf" : `${lead > 0 ? "+" : ""}${unit === "Souls" ? fmtK(lead) : lead} ${unit}`}</div></div>;
}
