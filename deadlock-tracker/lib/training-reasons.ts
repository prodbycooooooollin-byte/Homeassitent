import { laneInfo, valueAt } from "./insights";
import { aimRates, laneDiff, soloDeaths, topPlayers, type TrainingMatch } from "./training";
import type { MatchPlayer } from "./types";
import type { SkillId } from "./training-view";

/* Spielerspezifische Gründe: Warum ist ein Wert bei DIR schlecht? Aus Todesumständen, Held-/Lane-Unterschieden
 * und Sieg/Niederlage-Vergleichen. Helden erscheinen als {hero:ID} und werden im Client durch Namen ersetzt. */

export interface Reason { title: string; text: string; fix?: string }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const nn = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);
const pc = (v: number) => `${Math.round(v * 100)} %`;
const r1 = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");

/* ---------- Todesursachen ---------- */

export type CauseId = "chain" | "outnumbered" | "gank" | "laneduel" | "opener" | "pickoff" | "nodmg" | "outfarmed" | "fight";
interface Death { cause: CauseId; t: number; killerHero?: number; deficit: number; richer?: number }

const deadAt = (p: MatchPlayer, t: number) => (p.deathLog ?? []).some((d) => d.t <= t && t < d.t + (d.durS ?? 0));
const nwAt = (p: MatchPlayer, t: number) => (p.timeline ? valueAt(p.timeline as never, "nw", t) : 0);
const dmgIn = (p: MatchPlayer, a: number, b: number) => (p.timeline ? valueAt(p.timeline as never, "dmg", b) - valueAt(p.timeline as never, "dmg", Math.max(0, a)) : 0);

export function classifyDeaths(ms: TrainingMatch[]): Death[] {
  const out: Death[] = [];
  for (const m of ms) {
    const me = m.me, log = me.deathLog ?? [];
    if (!log.length) continue;
    const mates = m.details.players.filter((p) => p.team === me.team && p.accountId !== me.accountId);
    const foes = m.details.players.filter((p) => p.team !== me.team);
    const avg30 = me.timeline ? (dmgIn(me, 0, m.details.durationS) / Math.max(1, m.details.durationS)) * 30 : 0;
    log.forEach((d, i) => {
      const t = d.t;
      const prevEnd = i > 0 ? log[i - 1].t + (log[i - 1].durS ?? 0) : null;
      const killer = d.killerSlot !== undefined ? foes.find((p) => p.slot === d.killerSlot) : undefined;
      const teamDead = mates.filter((p) => deadAt(p, t)).length, enemyDead = foes.filter((p) => deadAt(p, t)).length;
      const near = (ps: MatchPlayer[], a: number, b: number) => ps.some((p) => (p.deathLog ?? []).some((x) => x.t >= a && x.t <= b));
      const before = near(mates, t - 25, t - 0.01), after = near(mates, t + 0.01, t + 25), foeNear = near(foes, t - 25, t + 25);
      const nodmg = avg30 > 0 && me.timeline ? dmgIn(me, t - 30, t) < avg30 * 0.3 : false;
      const richer = killer && nwAt(me, t) > 0 ? nwAt(killer, t) / nwAt(me, t) : undefined;
      let cause: CauseId = "fight";
      if (prevEnd !== null && t - prevEnd < 45) cause = "chain";
      else if (teamDead - enemyDead >= 2) cause = "outnumbered";
      else if (t < 720 && killer?.lane && me.lane && killer.lane !== me.lane) cause = "gank";
      else if (t < 720 && killer?.lane && me.lane && killer.lane === me.lane) cause = "laneduel";
      else if (!before && (after || foeNear) && (after || teamDead === 0)) cause = after ? "opener" : "pickoff";
      else if (!before && !after && !foeNear) cause = "pickoff";
      else if (nodmg) cause = "nodmg";
      else if (richer !== undefined && richer > 1.3) cause = "outfarmed";
      out.push({ cause, t, killerHero: killer?.heroId, deficit: teamDead - enemyDead, richer });
    });
  }
  return out;
}

const CAUSE: Record<CauseId, { label: string; text: (n: number, N: number, ds: Death[]) => string; fix: (ds: Death[]) => string }> = {
  chain: {
    label: "Folgetod nach dem Respawn",
    text: (n, N) => `${n} von ${N} Toden (${pc(n / N)}) passieren weniger als 45 Sekunden nach deinem letzten Respawn – du läufst direkt wieder in den nächsten Tod.`,
    fix: () => "Nach dem Respawn zuerst zum Team oder zur Lane aufschließen und Leben/Schild prüfen, bevor du wieder in einen Kampf gehst.",
  },
  outnumbered: {
    label: "Kampf in Unterzahl",
    text: (n, N, ds) => `Bei ${n} von ${N} Toden (${pc(n / N)}) waren zu deinem Todeszeitpunkt im Schnitt ${r1(mean(ds.map((d) => d.deficit)))} Mitspieler mehr tot als Gegner – du bleibst in Kämpfen, die schon verloren sind.`,
    fix: () => "Zieh dich zurück, sobald zwei Mitspieler tot sind und die Gegner noch leben – der Kampf ist dann nicht mehr zu drehen.",
  },
  gank: {
    label: "Gank von einer anderen Lane",
    text: (n, N, ds) => `${n} deiner Tode (${pc(n / N)}) sind frühe Tode durch einen Gegner von einer ANDEREN Lane${topHero(ds) ? ` – meist {hero:${topHero(ds)}}` : ""}. Du wirst in der Lane überrascht.`,
    fix: () => "Ab Minute 4 bei jedem Blick auf die Minimap prüfen, ob ein Gegner in seiner Lane fehlt – dann hinter eigene Creeps oder zum Guardian zurückziehen.",
  },
  laneduel: {
    label: "Lane-Duell verloren",
    text: (n, N, ds) => `${n} deiner Tode (${pc(n / N)}) fallen früh im direkten Duell mit deinem Lane-Gegner${topHero(ds) ? ` ({hero:${topHero(ds)}})` : ""}.`,
    fix: () => "Trades nur eingehen, wenn du mehr Leben hast oder deine Fähigkeiten bereit sind – sonst Creeps farmen und auf seinen Fehler warten.",
  },
  opener: {
    label: "Du fällst als Erster",
    text: (n, N) => `In ${n} Fällen (${pc(n / N)}) bist du der Erste deines Teams, der im Kampf stirbt – du eröffnest Kämpfe oder stehst vorne, ohne dass jemand mitgeht.`,
    fix: () => "Dem Frontliner den ersten Schaden überlassen und erst nachgehen, wenn die Gegner ihre Fähigkeiten gezeigt haben.",
  },
  pickoff: {
    label: "Allein gepickt",
    text: (n, N, ds) => `${n} Tode (${pc(n / N)}) passieren völlig allein – weder ein Mitspieler noch ein Gegner fällt innerhalb von 25 Sekunden. ${pc(ds.filter((d) => d.t > 720).length / ds.length)} davon nach Minute 12.`,
    fix: () => "Nach Minute 12 nur mit einem Mitspieler in Reichweite unterwegs sein; allein nur auf Camp- und Kistenrouten, die vom Gegner einsehbar sind, vermeiden.",
  },
  nodmg: {
    label: "Gestorben ohne Schaden zu machen",
    text: (n, N) => `Bei ${n} Toden (${pc(n / N)}) hast du in den letzten 30 Sekunden kaum Schaden gemacht (unter 30 % deines Schnitts) – du wirst überrascht oder fliehst zu spät.`,
    fix: () => "Wenn du keinen Schaden mehr anbringen kannst (Ziel außer Reichweite, Fähigkeiten auf Cooldown), sofort zurückziehen statt im Kampf zu bleiben.",
  },
  outfarmed: {
    label: "Gegner deutlich reicher",
    text: (n, N, ds) => `${n} Tode (${pc(n / N)}) gegen Gegner, die zu dem Zeitpunkt im Schnitt ${Math.round((mean(ds.map((d) => d.richer ?? 1)) - 1) * 100)} % mehr Souls hatten als du.`,
    fix: () => "Kämpfe gegen deutlich reichere Gegner meiden und erst aufholen (Camps, Kisten), statt dich zu duellieren.",
  },
  fight: {
    label: "Teamfight verloren",
    text: (n, N) => `${n} Tode (${pc(n / N)}) fallen in Teamfights, die euer Team verliert.`,
    fix: () => "Auf die Positionierung achten: hinter dem Frontliner bleiben und vor dem Fight Fluchtwege einplanen.",
  },
};

function topHero(ds: Death[]): number | undefined {
  const c = new Map<number, number>();
  for (const d of ds) if (d.killerHero) c.set(d.killerHero, (c.get(d.killerHero) ?? 0) + 1);
  const best = [...c].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : undefined;
}

/** Die häufigsten, belegten Todesursachen dieses Spielers (mit Zahlen), größte zuerst. */
export function deathReasons(ms: TrainingMatch[]): Reason[] {
  const ds = classifyDeaths(ms);
  if (ds.length < 8) return [];
  const by = new Map<CauseId, Death[]>();
  for (const d of ds) by.set(d.cause, [...(by.get(d.cause) ?? []), d]);
  const out: Reason[] = [];
  for (const [id, list] of [...by].sort((a, b) => b[1].length - a[1].length).slice(0, 3)) {
    if (list.length / ds.length < 0.15) continue;
    out.push({ title: CAUSE[id].label, text: CAUSE[id].text(list.length, ds.length, list), fix: CAUSE[id].fix(list) });
  }
  const killer = topHero(ds);
  if (killer) {
    const n = ds.filter((d) => d.killerHero === killer).length;
    if (n / ds.length >= 0.2) out.push({ title: "Ein Held tötet dich besonders oft", text: `${n} von ${ds.length} Toden (${pc(n / ds.length)}) gehen auf {hero:${killer}}.` });
  }
  return out;
}


/* ---------- Anteile der Todesursachen (für die kompakte Übersicht) ---------- */

export interface CauseShare { id: CauseId; label: string; count: number; share: number; short: string; fix: string }

const SENTENCE: Record<CauseId, (n: number, N: number) => string> = {
  chain: (n, N) => `${n} von ${N} Toden folgen unter 45 s nach dem Respawn.`,
  outnumbered: (n, N) => `${n} von ${N} Toden fallen, obwohl dein Team schon in Unterzahl ist.`,
  gank: (n, N) => `${n} von ${N} Toden sind frühe Ganks von einer anderen Lane.`,
  laneduel: (n, N) => `${n} von ${N} Toden fallen früh im Duell mit deinem Lane-Gegner.`,
  opener: (n, N) => `Bei ${n} von ${N} Toden stirbst du als Erster deines Teams.`,
  pickoff: (n, N) => `${n} von ${N} Toden passieren völlig allein, ohne Kampf um dich herum.`,
  nodmg: (n, N) => `${n} von ${N} Toden folgen, ohne dass du zuvor Schaden machst.`,
  outfarmed: (n, N) => `${n} von ${N} Toden gehen an Gegner mit deutlich mehr Souls.`,
  fight: (n, N) => `${n} von ${N} Toden fallen in verlorenen Teamfights.`,
};

/** Reine Funktion: Anteil je Ursache aus bereits klassifizierten Toden, größte zuerst. */
export function causeSharesOf(deaths: { cause: CauseId }[], fixOf: (id: CauseId) => string = () => ""): CauseShare[] {
  const N = deaths.length;
  if (!N) return [];
  const count = new Map<CauseId, number>();
  for (const d of deaths) count.set(d.cause, (count.get(d.cause) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, label: CAUSE[id].label, count: n, share: n / N, short: SENTENCE[id](n, N), fix: fixOf(id) }));
}

export function causeShares(ms: TrainingMatch[]): CauseShare[] {
  const all = classifyDeaths(ms);
  if (all.length < 8) return [];
  return causeSharesOf(all, (id) => CAUSE[id].fix(all.filter((d) => d.cause === id)));
}

export interface SurvivalKpi { per10: number; ref10: number | null; soloShare: number | null; respawnS: number | null; deaths: number }

/** Kennzahlen für die Überleben-Übersicht: Tode/10 Min (du vs. Beste), Anteil allein gestorben, Ø tote Zeit pro Tod. */
export function survivalKpi(ms: TrainingMatch[]): SurvivalKpi | null {
  const u = ms.filter((m) => m.details.durationS >= 600);
  if (!u.length) return null;
  const rate = (p: MatchPlayer, m: TrainingMatch) => (p.deaths / m.details.durationS) * 600;
  const per10 = mean(u.map((m) => rate(m.me, m)));
  const refs = u.flatMap((m) => topPlayers(m).map((p) => rate(p, m)));
  const so = soloDeaths(u);
  const durs = u.flatMap((m) => (m.me.deathLog ?? []).map((d) => d.durS).filter((x): x is number => nn(x) && x > 0));
  return { per10, ref10: refs.length ? mean(refs) : null, soloShare: so.deaths >= 5 ? so.solo / so.deaths : null, respawnS: durs.length ? mean(durs) : null, deaths: u.reduce((a, m) => a + m.me.deaths, 0) };
}

/* ---------- Unterschiede nach Held, Lane und Sieg/Niederlage ---------- */

type Stat = (m: TrainingMatch) => number | null;
interface Group { key: string; label: string; vals: number[] }
const mins = (m: TrainingMatch) => Math.max(1, m.details.durationS / 60);

function spread(ms: TrainingMatch[], f: Stat, fmt: (v: number) => string, lowerBetter: boolean, what: string, unitLabel: string): Reason[] {
  const out: Reason[] = [];
  const groups = (key: (m: TrainingMatch) => string | null, label: (k: string) => string, minN: number): Group[] => {
    const g = new Map<string, number[]>();
    for (const m of ms) { const k = key(m), v = f(m); if (k && nn(v)) g.set(k, [...(g.get(k) ?? []), v]); }
    return [...g].filter(([, v]) => v.length >= minN).map(([k, vals]) => ({ key: k, label: label(k), vals }));
  };
  const compare = (gs: Group[], by: string): Reason | null => {
    if (gs.length < 2) return null;
    const avg = gs.map((g) => ({ g, v: mean(g.vals) }));
    avg.sort((a, b) => (lowerBetter ? a.v - b.v : b.v - a.v));
    const best = avg[0], worst = avg[avg.length - 1];
    const rel = Math.abs(best.v - worst.v) / Math.max(1e-6, Math.abs(best.v) + Math.abs(worst.v)) * 2;
    if (rel < 0.25) return null;
    return { title: `${what}: deutlich abhängig ${by}`, text: `${worst.g.label}: ${fmt(worst.v)} ${unitLabel} (${worst.g.vals.length} Matches) – dagegen ${best.g.label}: ${fmt(best.v)} (${best.g.vals.length}).` };
  };
  const hero = compare(groups((m) => String(m.me.heroId), (k) => `mit {hero:${k}}`, 3), "vom Helden");
  if (hero) out.push(hero);
  const lane = compare(groups((m) => (m.me.lane ? String(m.me.lane) : null), (k) => `auf Lane ${laneInfo(Number(k)).name}`, 3), "von der Lane");
  if (lane) out.push(lane);
  return out;
}

const perMin = (f: (p: MatchPlayer) => number | undefined | null): Stat => (m) => { const v = f(m.me); return nn(v) ? v / mins(m) : null; };

/** Konkrete Gründe je Fähigkeit – nur Befunde, die in den Daten dieses Spielers wirklich auffallen. */
export function reasonsFor(skill: SkillId, ms: TrainingMatch[]): Reason[] {
  const out: Reason[] = [];
  switch (skill) {
    case "survival":
    case "teamplay": {
      out.push(...deathReasons(ms));
      out.push(...spread(ms, perMin((p) => p.deaths), (v) => r1(v * 10), true, "Tode", "pro 10 Min").map((r) => ({ ...r, text: r.text.replace(/(\d+,?\d*) pro 10 Min/g, "$1 Tode pro 10 Min") })).slice(0, 2));
      break;
    }
    case "farming": {
      const f: Stat = (m) => (m.me.creeps && m.me.creeps.possible > 0 ? m.me.creeps.lane / m.me.creeps.possible : null);
      out.push(...spread(ms, f, (v) => pc(v), false, "Lane-Creeps", "der Creeps"));
      const early = ms.map((m) => (m.me.deathLog ?? []).filter((d) => d.t < 480).length);
      const withEarly = ms.filter((m, i) => early[i] > 0), without = ms.filter((_, i) => early[i] === 0);
      if (withEarly.length >= 3 && without.length >= 3) {
        const a = mean(withEarly.map(f).filter(nn)), b = mean(without.map(f).filter(nn));
        if (b > 0 && a < b * 0.9) out.push({ title: "Frühe Tode kosten dir Creeps", text: `In Matches, in denen du vor Minute 8 stirbst, triffst du ${pc(a)} der Creeps, ohne frühen Tod ${pc(b)}.` });
      }
      break;
    }
    case "jungle": {
      out.push(...spread(ms, (m) => m.me.creeps?.neutral ?? null, (v) => r1(v), false, "Camps", "Camps pro Match"));
      const none = ms.filter((m) => (m.me.creeps?.neutral ?? 99) <= 2).length;
      if (none / Math.max(1, ms.length) >= 0.2) out.push({ title: "Oft ganz ohne Jungle", text: `In ${none} von ${ms.length} Matches nimmst du höchstens 2 Camps – der Jungle fehlt in deinem Spiel fast komplett.` });
      out.push(...spread(ms, perMin((p) => p.souls?.neutral), (v) => String(Math.round(v)), false, "Camp-Souls", "pro Min").slice(0, 1));
      break;
    }
    case "lane": {
      out.push(...spread(ms, laneDiff, (v) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}`, false, "Lane-Ergebnis", "Souls bei 8:00"));
      const early = ds(ms).filter((d) => d.t < 480);
      if (early.length >= 3) {
        const main = [...new Map(early.map((d) => [d.cause, early.filter((x) => x.cause === d.cause).length])).entries()].sort((a, b) => b[1] - a[1])[0];
        out.push({ title: "So verlierst du früh Leben", text: `${early.length} deiner Tode fallen vor Minute 8 – am häufigsten: ${CAUSE[main[0]].label.toLowerCase()} (${main[1]}×).`, fix: CAUSE[main[0]].fix(early) });
      }
      break;
    }
    case "aim": {
      out.push(...spread(ms, (m) => { const a = aimRates([m.me]).accuracy; return a; }, (v) => pc(v), false, "Trefferquote", "Trefferquote"));
      const crit = ms.map((m) => aimRates([m.me]).crit).filter(nn), ref = ms.flatMap((m) => topPlayers(m).map((p) => aimRates([p]).crit)).filter(nn);
      if (crit.length >= 3 && ref.length >= 3 && mean(crit) < mean(ref) * 0.8) out.push({ title: "Kopftreffer", text: `Nur ${pc(mean(crit))} deiner Heldentreffer sind Kopftreffer, bei den Besten ${pc(mean(ref))} – du zielst zu tief.`, fix: "Fadenkreuz in Kopfhöhe halten, besonders beim Strafen und Nachführen." });
      break;
    }
    case "objectives": {
      out.push(...spread(ms, perMin((p) => p.objectiveDamage), (v) => String(Math.round(v)), false, "Objective-Schaden", "pro Min"));
      break;
    }
    case "items": {
      const first = (p: MatchPlayer) => { const t = (p.items ?? []).map((i) => i.t).filter((x) => x > 0); return t.length ? Math.min(...t) : null; };
      const mine = ms.map((m) => first(m.me)).filter(nn), ref = ms.flatMap((m) => topPlayers(m).map(first)).filter(nn);
      if (mine.length >= 3 && ref.length >= 3 && mean(mine) > mean(ref) + 20) out.push({ title: "Erster Einkauf zu spät", text: `Dein erstes Item kaufst du im Schnitt nach ${Math.round(mean(mine))} Sekunden, die Besten nach ${Math.round(mean(ref))}.`, fix: "Souls schon in den ersten Minuten ausgeben – nach den ersten Creep-Wellen gleich im Shop kaufen." });
      out.push(...spread(ms, (m) => (m.me.items?.length ? m.me.items.filter((i) => i.t <= 600).length : null), (v) => r1(v), false, "Items bis Minute 10", "Items"));
      break;
    }
  }
  return out.slice(0, 5);
}

const dsCache = new WeakMap<TrainingMatch[], Death[]>();
function ds(ms: TrainingMatch[]): Death[] { let d = dsCache.get(ms); if (!d) { d = classifyDeaths(ms); dsCache.set(ms, d); } return d; }
// soloDeaths bleibt für externe Verwendung exportiert
export { soloDeaths };

export interface DeathExplained { t: number; label: string; killerHero?: number; detail: string }
const SHORT: Record<CauseId, (d: Death) => string> = {
  chain: () => "direkt nach dem Respawn wieder gestorben",
  outnumbered: (d) => `Unterzahl: ${d.deficit} Mitspieler mehr tot als Gegner`,
  gank: () => "früh von einer anderen Lane gegankt",
  laneduel: () => "Lane-Duell verloren",
  opener: () => "als Erster im Kampf gefallen",
  pickoff: () => "allein gepickt (kein anderer Tod in 25 s)",
  nodmg: () => "ohne eigenen Schaden gestorben",
  outfarmed: (d) => `Gegner hatte ${Math.round(((d.richer ?? 1) - 1) * 100)} % mehr Souls`,
  fight: () => "Teamfight verloren",
};

/** Alle Tode eines Spielers in einem Match mit der jeweils wahrscheinlichsten Ursache. */
export function explainDeaths(d: import("./types").MatchDetails, me: MatchPlayer): DeathExplained[] {
  const list = classifyDeaths([{ details: d, me, scores: new Map(), won: false }]);
  return list.map((x) => ({ t: x.t, label: CAUSE[x.cause].label, killerHero: x.killerHero, detail: SHORT[x.cause](x) }));
}
