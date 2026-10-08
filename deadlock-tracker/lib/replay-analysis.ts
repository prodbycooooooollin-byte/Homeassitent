import type { MatchDetails } from "./types";
import type { ReplayAnalysis, ReplayData, ReplayKill, Scene, SceneFact, SceneKind } from "./replay-types";

/* Szenen-Analyse: Aus Positionen, Leben und Kill-Ereignissen eines Replays werden pro Tod/Kill/Assist konkrete Fakten berechnet
 * (Abstand zum Team, Überzahl, Lebensverlauf, Zeit seit Respawn …). Der Text entsteht aus genau diesen Fakten – es gibt keine
 * Standardantwort pro Ursache, sondern Zahlen, Helden und Zeiten der jeweiligen Szene.
 * Hinweis: Deadlock kennt keine Wards. „Vision“ wird deshalb nicht bewertet, sondern Abstand, Überzahl und Position. */

const UNITS_PER_M = 39.37; // Source-Einheiten (Zoll) -> Meter
const R_NEAR = 1500; // „im Kampfgeschehen“ (~38 m)
const R_TEAM = 2600; // „beim Team“ (~66 m)

const m = (u: number) => Math.round(u / UNITS_PER_M);
const pct = (v: number) => `${Math.round(v * 100)} %`;
const clock = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, "0")}`;

class View {
  constructor(readonly d: ReplayData) {}
  get n() { return this.d.x[0]?.length ?? 0; }
  idx(t: number) { return Math.max(0, Math.min(this.n - 1, Math.round((t - this.d.tStart) / this.d.step))); }
  alive(p: number, t: number) { return this.d.alive[p]?.[this.idx(t)] === 1; }
  pos(p: number, t: number): [number, number] { const i = this.idx(t); return [this.d.x[p][i], this.d.y[p][i]]; }
  hpFrac(p: number, t: number) { const i = this.idx(t); const mx = this.d.maxHp[p]?.[i] || 0; return mx > 0 ? Math.max(0, Math.min(1, this.d.hp[p][i] / mx)) : null; }
  dist(a: number, b: number, t: number) { const [ax, ay] = this.pos(a, t), [bx, by] = this.pos(b, t); return Math.hypot(ax - bx, ay - by); }
  team(p: number) { return this.d.players[p].team; }
}

/** Zeitversatz zwischen Replay-Uhr und Spieluhr: Median der Differenzen zwischen Replay-Toden und den Todeszeiten der Match-Daten. */
export function alignClock(d: ReplayData, details: MatchDetails | null): { offset: number; aligned: boolean } {
  const diffs: number[] = [];
  if (details) {
    d.players.forEach((rp, pi) => {
      const mp = details.players.find((p) => p.accountId === rp.accountId);
      const log = [...(mp?.deathLog ?? [])].sort((a, b) => a.t - b.t);
      const mine = d.kills.filter((k) => k.victim === pi).sort((a, b) => a.t - b.t);
      if (!log.length || log.length !== mine.length) return;
      mine.forEach((k, i) => diffs.push(k.t - log[i].t));
    });
  }
  if (diffs.length >= 2) {
    diffs.sort((a, b) => a - b);
    return { offset: diffs[Math.floor(diffs.length / 2)], aligned: true };
  }
  return { offset: d.tStart, aligned: false };
}

interface Axis { b0: [number, number]; ax: number; ay: number; len: number }

/** Grundlinie von Basis zu Basis: Teamschwerpunkte kurz nach Spielbeginn. */
function axisOf(v: View, offset: number): Axis | null {
  const d = v.d;
  for (const dt of [20, 60, 120]) {
    const c: [number, number][] = [[0, 0], [0, 0]]; const k = [0, 0];
    d.players.forEach((p, pi) => {
      for (let s = -2; s <= 2; s++) {
        const t = offset + dt + s;
        if (!v.alive(pi, t)) continue;
        const [x, y] = v.pos(pi, t);
        if (!x && !y) continue;
        c[p.team][0] += x; c[p.team][1] += y; k[p.team]++;
      }
    });
    if (k[0] && k[1]) {
      const b0: [number, number] = [c[0][0] / k[0], c[0][1] / k[0]];
      const b1: [number, number] = [c[1][0] / k[1], c[1][1] / k[1]];
      const ax = b1[0] - b0[0], ay = b1[1] - b0[1];
      const len = Math.hypot(ax, ay);
      if (len > 3000) return { b0, ax, ay, len };
    }
  }
  return null;
}

/** Fortschritt in Richtung Gegnerbasis: 0 = eigene Basis, 1 = gegnerische Basis. */
const forward = (a: Axis, team: 0 | 1, [x, y]: [number, number]) => {
  const p = ((x - a.b0[0]) * a.ax + (y - a.b0[1]) * a.ay) / (a.len * a.len);
  return team === 0 ? p : 1 - p;
};

export interface Situation {
  /** lebende Verbündete / Gegner im Umkreis (ohne den Betrachteten) */
  alliesNear: number; enemiesNear: number;
  nearestAllyM: number | null; nearestEnemyM: number | null;
  /** Vorsprung vor den Teammitgliedern in Metern (negativ = hinter ihnen) */
  aheadM: number | null;
  teamAwayM: number | null;
  hp: { t: number; f: number | null }[];
}

function situation(v: View, ax: Axis | null, p: number, t: number): Situation {
  const team = v.team(p);
  let alliesNear = 0, enemiesNear = 0, nearA = Infinity, nearE = Infinity;
  const allyFwd: number[] = [];
  const allyPos: [number, number][] = [];
  v.d.players.forEach((q, qi) => {
    if (qi === p || !v.alive(qi, t)) return;
    const dd = v.dist(p, qi, t);
    if (q.team === team) {
      if (dd <= R_NEAR) alliesNear++;
      nearA = Math.min(nearA, dd);
      if (ax) allyFwd.push(forward(ax, team, v.pos(qi, t)));
      allyPos.push(v.pos(qi, t));
    } else {
      if (dd <= R_NEAR) enemiesNear++;
      nearE = Math.min(nearE, dd);
    }
  });
  let aheadM: number | null = null;
  if (ax && allyFwd.length >= 2) aheadM = Math.round(((forward(ax, team, v.pos(p, t)) - allyFwd.reduce((a, b) => a + b, 0) / allyFwd.length) * ax.len) / UNITS_PER_M);
  let teamAwayM: number | null = null;
  if (allyPos.length) {
    const cx = allyPos.reduce((a, q) => a + q[0], 0) / allyPos.length, cy = allyPos.reduce((a, q) => a + q[1], 0) / allyPos.length;
    const [px, py] = v.pos(p, t);
    teamAwayM = m(Math.hypot(px - cx, py - cy));
  }
  return {
    alliesNear, enemiesNear,
    nearestAllyM: Number.isFinite(nearA) ? m(nearA) : null, nearestEnemyM: Number.isFinite(nearE) ? m(nearE) : null,
    aheadM, teamAwayM,
    hp: [-9, -6, -4, -2, -1, 0].map((dt) => ({ t: dt, f: v.hpFrac(p, t + dt) })),
  };
}

const first = <T,>(xs: (T | undefined | null | false)[]): T | undefined => xs.find(Boolean) as T | undefined;

export interface AnalyzeOptions {
  heroName: (heroId: number) => string;
  /** zufälliger, aber stabiler Startwert für Formulierungen */
  seed?: number;
}

/** Wählt eine Formulierung stabil nach Zahlenwert – gleiche Szene ergibt immer denselben Text, verschiedene Szenen unterscheiden sich. */
const pick = <T,>(xs: T[], n: number) => xs[Math.abs(Math.round(n)) % xs.length];

export function analyzeReplay(d: ReplayData, details: MatchDetails | null, focusAccount: number, opt: AnalyzeOptions): ReplayAnalysis {
  const v = new View(d);
  const { offset, aligned } = alignClock(d, details);
  const ax = axisOf(v, offset);
  const me = d.players.findIndex((p) => p.accountId === focusAccount);
  const out: ReplayAnalysis = { offset, aligned, scenes: [], causes: {} };
  if (me < 0 || v.n < 4) return out;

  const heroOf = (pi: number) => {
    const h = d.players[pi]?.heroId ?? details?.players.find((p) => p.accountId === d.players[pi]?.accountId)?.heroId;
    return h ? opt.heroName(h) : d.players[pi]?.name ?? "Gegner";
  };
  const deathsOf = (pi: number) => d.kills.filter((k) => k.victim === pi).sort((a, b) => a.t - b.t);
  const myDeaths = deathsOf(me);
  const mpDetails = details?.players.find((p) => p.accountId === focusAccount);
  const clk = (t: number) => t - offset;

  d.kills.slice().sort((a, b) => a.t - b.t).forEach((k, ki) => {
    const kind: SceneKind | null = k.victim === me ? "death" : k.attacker === me ? "kill" : k.assisters.includes(me) ? "assist" : null;
    if (!kind) return;
    const scene = kind === "death" ? deathScene(k, ki) : killScene(k, ki, kind);
    if (scene) out.scenes.push(scene);
  });
  for (const s of out.scenes) if (s.kind === "death") out.causes[s.cause] = (out.causes[s.cause] ?? 0) + 1;
  return out;

  /* ---------- Tod ---------- */
  function deathScene(k: ReplayKill, ki: number): Scene {
    const t = k.t;
    const s = situation(v, ax, me, t - 1.5);
    const a = k.attacker >= 0 ? k.attacker : -1;
    const facts: SceneFact[] = [];
    const killer = a >= 0 ? heroOf(a) : "ein Gegner";
    const helpers = k.assisters.filter((x) => x >= 0 && x !== a);
    const attackers = (a >= 0 ? 1 : 0) + helpers.length;

    // Lebensverlauf: ab wann ging es bergab, wie schnell
    const hpNow = s.hp.map((h) => h.f);
    const startHp = first(s.hp.filter((h) => h.t <= -6 && h.f !== null).map((h) => h.f)) ?? null;
    let firstHit: number | null = null;
    for (let dt = -12; dt <= 0; dt += 0.5) { const f = v.hpFrac(me, t + dt); if (f !== null && f < 0.97) { firstHit = dt; break; } }
    const fightS = firstHit === null ? null : Math.round(-firstHit);
    const prev = myDeaths[myDeaths.findIndex((x) => x === k) - 1];
    const durPrev = mpDetails?.deathLog ? [...mpDetails.deathLog].sort((x, y) => x.t - y.t)[Math.max(0, myDeaths.indexOf(k) - 1)]?.durS : undefined;
    const aliveS = prev ? Math.round(t - prev.t - (durPrev ?? 0)) : Math.round(clk(t));
    // Gegenwert: Kill eines Teammitglieds kurz danach oder von dir kurz davor
    const traded = d.kills.find((q) => q !== k && v.team(q.victim) !== d.players[me].team && q.t >= t - 3 && q.t <= t + 8);
    const gotKill = d.kills.find((q) => q.attacker === me && q.t >= t - 10 && q.t < t);
    const killerHp = a >= 0 ? v.hpFrac(a, t - 0.5) : null;

    // Ursachen mit Gewicht (höchstes gewinnt, Rest wird zu Fakten)
    const causes: { key: string; w: number }[] = [];
    if (s.aheadM !== null && s.aheadM >= 14 && s.alliesNear === 0) causes.push({ key: "overextended", w: 3 + Math.min(3, s.aheadM / 20) });
    if (s.alliesNear === 0 && s.enemiesNear >= 2) causes.push({ key: "isolated", w: 3 + s.enemiesNear * 0.4 });
    if (s.enemiesNear >= s.alliesNear + 3) causes.push({ key: "outnumbered", w: 2.5 + (s.enemiesNear - s.alliesNear) * 0.5 });
    if (startHp !== null && startHp < 0.4 && (fightS ?? 0) <= 3) causes.push({ key: "lowhp", w: 2.8 });
    if (attackers >= 3 && (fightS ?? 99) <= 4) causes.push({ key: "focus", w: 2.6 + attackers * 0.2 });
    if ((fightS ?? 0) >= 8) causes.push({ key: "stayed", w: 2.2 + Math.min(2, (fightS ?? 0) / 8) });
    if (prev && aliveS < 25) causes.push({ key: "fresh", w: 2.0 });
    if (s.teamAwayM !== null && s.teamAwayM > 90 && s.alliesNear === 0) causes.push({ key: "teamaway", w: 2.4 });
    if (gotKill || traded) causes.push({ key: "trade", w: 1.4 });
    if (!causes.length) causes.push({ key: "lost", w: 1 });
    causes.sort((x, y) => y.w - x.w);
    const main = causes[0].key;

    // Fakten (alle konkret mit Zahlen)
    facts.push({ key: "who", tone: "info", text: attackers > 1 ? `${killer} + ${helpers.length} weitere (${helpers.slice(0, 3).map(heroOf).join(", ")})` : `${killer} allein` });
    if (s.nearestAllyM !== null) facts.push({ key: "ally", tone: s.alliesNear ? "good" : "bad", text: s.alliesNear ? `${s.alliesNear} Verbündete im Umkreis (nächster ${s.nearestAllyM} m)` : `Kein Verbündeter in ${m(R_NEAR)} m – nächster ${s.nearestAllyM} m entfernt` });
    if (s.enemiesNear) facts.push({ key: "enemy", tone: "bad", text: `${s.enemiesNear} Gegner im Umkreis${s.nearestEnemyM !== null ? ` (nächster ${s.nearestEnemyM} m)` : ""}` });
    if (s.aheadM !== null && Math.abs(s.aheadM) >= 8) facts.push({ key: "ahead", tone: s.aheadM > 0 ? "bad" : "info", text: s.aheadM > 0 ? `${s.aheadM} m weiter vorn als dein Team` : `${-s.aheadM} m hinter deinem Team` });
    if (startHp !== null) facts.push({ key: "hp", tone: startHp < 0.5 ? "bad" : "info", text: `Leben 6 s vorher: ${pct(startHp)}${hpNow[hpNow.length - 2] !== null ? ` → 1 s vorher: ${pct(hpNow[hpNow.length - 2]!)}` : ""}` });
    if (fightS !== null && fightS > 0) facts.push({ key: "fight", tone: fightS >= 8 ? "bad" : "info", text: `Erster Schaden ${fightS} s vor dem Tod` });
    if (killerHp !== null) facts.push({ key: "killerhp", tone: killerHp < 0.3 ? "bad" : "info", text: `${killer} hatte beim Kill noch ${pct(killerHp)} Leben` });
    if (aliveS >= 0) facts.push({ key: "alive", tone: aliveS < 25 ? "bad" : "info", text: `${aliveS} s seit dem letzten Respawn` });
    if (k.lostGold) facts.push({ key: "gold", tone: "bad", text: `${k.lostGold} Souls verloren` });
    const topDmg = (k.records ?? []).slice().sort((x, y) => y.damage - x.damage)[0];
    if (topDmg && topDmg.damage > 0) facts.push({ key: "dmg", tone: "info", text: `Größte Schadensquelle: ${topDmg.heroId ? opt.heroName(topDmg.heroId) : "Gegner"} mit ${Math.round(topDmg.damage)}${topDmg.abilityId ? " (Fähigkeit)" : ""}` });
    if (traded) facts.push({ key: "trade", tone: "good", text: `Dein Team hat danach ${heroOf(traded.victim)} erwischt (${Math.max(0, Math.round(traded.t - t))} s später)` });
    else if (gotKill) facts.push({ key: "gotkill", tone: "good", text: `Du hast vorher ${heroOf(gotKill.victim)} erwischt` });
    else facts.push({ key: "nogain", tone: "bad", text: "Kein Gegenwert – niemand aus dem Gegnerteam ist im Umfeld gefallen" });

    const when = `${clock(clk(t))}`;
    const n = ki + (s.aheadM ?? 0) + (s.nearestAllyM ?? 0);
    const text = explainDeath(main, { s, killer, attackers, helpers: helpers.map(heroOf), fightS, startHp, aliveS, killerHp, traded: !!traded, gotKill: !!gotKill, when, n, hp1: hpNow[hpNow.length - 2] ?? null });
    return {
      id: `d${ki}`, kind: "death", t: clk(t), rt: t, other: a, helpers, headline: text.headline, why: text.why, advice: text.advice, facts, cause: main, x: k.x ?? v.pos(me, t - 0.5)[0], y: k.y ?? v.pos(me, t - 0.5)[1],
    };
  }

  /* ---------- Kill / Assist ---------- */
  function killScene(k: ReplayKill, ki: number, kind: SceneKind): Scene | null {
    const t = k.t;
    const victim = k.victim;
    if (victim < 0) return null;
    const enemyTeam = d.players[victim].team;
    const sv = situation(v, ax, victim, t - 1.5);
    const sm = situation(v, ax, me, t - 1.5);
    const vName = heroOf(victim);
    const vHpBefore = v.hpFrac(victim, t - 4);
    const myHp = v.hpFrac(me, t - 0.5);
    const helpers = (kind === "kill" ? k.assisters : [k.attacker, ...k.assisters.filter((x) => x !== me)]).filter((x) => x >= 0 && x !== me);
    const died = d.kills.find((q) => q.victim === me && q.t > t && q.t <= t + 6);
    const facts: SceneFact[] = [];
    const isolated = sv.alliesNear === 0; // „allies“ aus Sicht des Opfers = seine Mitspieler
    const outnum = sm.alliesNear + 1 - sm.enemiesNear;

    facts.push({ key: "victim", tone: "info", text: `${vName} gefallen bei ${clock(clk(t))}` });
    if (sv.nearestAllyM !== null) facts.push({ key: "iso", tone: isolated ? "good" : "info", text: isolated ? `${vName} war ${sv.nearestAllyM} m von seinem nächsten Mitspieler entfernt` : `${sv.alliesNear} seiner Mitspieler waren in der Nähe` });
    if (vHpBefore !== null) facts.push({ key: "vhp", tone: vHpBefore < 0.5 ? "good" : "info", text: `${vName} hatte 4 s vorher ${pct(vHpBefore)} Leben` });
    if (myHp !== null) facts.push({ key: "myhp", tone: myHp > 0.6 ? "good" : "info", text: `Du selbst hattest ${pct(myHp)} Leben` });
    facts.push({ key: "num", tone: outnum > 0 ? "good" : outnum < 0 ? "bad" : "info", text: `Im Umkreis: du${sm.alliesNear ? ` + ${sm.alliesNear} Verbündete` : " allein"}, ${sm.enemiesNear} Gegner` });
    if (helpers.length) facts.push({ key: "help", tone: "info", text: `Mit ${helpers.slice(0, 3).map(heroOf).join(", ")}` });
    if (k.lostGold) facts.push({ key: "gold", tone: "good", text: `${k.lostGold} Souls für ${vName} verloren` });
    if (died) facts.push({ key: "trade", tone: "bad", text: `Du bist ${Math.round(died.t - t)} s später selbst gefallen` });
    const rr = kind === "kill";
    const key = isolated ? "pick" : outnum >= 2 ? "teamfight" : vHpBefore !== null && vHpBefore < 0.4 ? "finish" : "duel";
    const n = ki + (sv.nearestAllyM ?? 0) + (sm.alliesNear * 3);
    const verb = rr ? "gekillt" : "mitgeholfen";
    let why = "", advice = "", headline = "";
    if (key === "pick") {
      headline = `${rr ? "Pick" : "Assist bei Pick"} auf ${vName}`;
      why = `${vName} stand ${sv.nearestAllyM ?? "?"} m von seinem Team getrennt – ${helpers.length ? `mit ${helpers.length === 1 ? heroOf(helpers[0]) : `${helpers.length} Verbündeten`} hast du die Lücke genutzt` : "du hast die Lücke allein genutzt"}${vHpBefore !== null && vHpBefore < 0.7 ? `, er war schon bei ${pct(vHpBefore)} Leben` : ""}.`;
      advice = pick([
        `Genau das ist der Plan gegen Gegner, die sich lösen: Isolierte Ziele gezielt jagen, bevor ihr Team aufschließt.${died ? ` Dass du ${Math.round(died.t - t)} s später gefallen bist, zeigt aber: Nach dem Pick direkt zurückziehen.` : ""}`,
        `Sauber erkannt, dass ${vName} alleine war. ${died ? "Danach warst du selbst offen – beim nächsten Mal nach dem Kill sofort Deckung suchen." : "Nach dem Kill bist du heil rausgekommen – das ist der Wert eines guten Picks."}`,
      ], n);
    } else if (key === "teamfight") {
      headline = `Teamfight gewonnen: ${vName} ${verb}`;
      why = `Ihr wart im Umkreis ${sm.alliesNear + 1} gegen ${sm.enemiesNear} – die Überzahl hat den Kill ermöglicht${myHp !== null ? ` und du hattest dabei noch ${pct(myHp)} Leben` : ""}.`;
      advice = `Überzahl bewusst herstellen ist der stärkste Hebel: Den Kampf erst annehmen, wenn mindestens ${Math.max(2, sm.enemiesNear + 1)} von euch in Reichweite sind – wie hier.`;
    } else if (key === "finish") {
      headline = `${rr ? "Finisher" : "Assist"} gegen ${vName}`;
      why = `${vName} kam mit nur ${pct(vHpBefore ?? 0.3)} Leben aus dem Kampf${helpers.length ? ` (Vorarbeit von ${heroOf(helpers[0])})` : ""}. Du hast nachgesetzt, statt ihn laufen zu lassen.`;
      advice = "Angeschlagene Gegner konsequent verfolgen lohnt sich – achte nur darauf, dass die Verfolgung nicht in sein Team führt.";
    } else {
      headline = `Duell gegen ${vName} ${rr ? "gewonnen" : "unterstützt"}`;
      why = `Ein offenes Duell ${sm.enemiesNear <= 1 ? "1 gegen 1" : `mit ${sm.alliesNear + 1} gegen ${sm.enemiesNear}`}. ${myHp !== null ? `Du hattest dabei ${pct(myHp)} Leben` : ""}${vHpBefore !== null ? `, ${vName} ${pct(vHpBefore)} vor dem Ende` : ""}.`;
      advice = "Solche Duelle gewinnst du am sichersten mit Leben- und Positionsvorteil – hier hat beides gestimmt.";
    }
    return { id: `${rr ? "k" : "a"}${ki}`, kind, t: clk(t), rt: t, other: victim, helpers, headline, why, advice, facts, cause: key, x: k.x, y: k.y };
  }
}

interface DeathCtx {
  s: Situation; killer: string; attackers: number; helpers: string[]; fightS: number | null; startHp: number | null; aliveS: number; killerHp: number | null;
  traded: boolean; gotKill: boolean; when: string; n: number; hp1: number | null;
}

function explainDeath(cause: string, c: DeathCtx): { headline: string; why: string; advice: string } {
  const { s } = c;
  const by = c.attackers > 1 ? `${c.killer} und ${c.helpers.length} weitere` : c.killer;
  const gain = c.traded ? " Immerhin hat dein Team danach zurückgeschlagen." : c.gotKill ? " Du hast vorher einen Gegner erwischt – der Tausch war fair." : "";
  switch (cause) {
    case "overextended":
      return {
        headline: `Zu weit vorgelaufen – ${by}`,
        why: `Du standest ${s.aheadM} m vor deinem Team${s.nearestAllyM !== null ? ` (nächster Verbündeter ${s.nearestAllyM} m weg)` : ""}, ${s.enemiesNear === 1 ? "1 Gegner war" : `${s.enemiesNear} Gegner waren`} in Reichweite, und es war niemand da, der dir helfen konnte.${gain}`,
        advice: pick([
          `Orientiere dich an der Linie deines Teams: Du darfst höchstens etwa 10–15 m davor stehen. Ab dort ziehst du bei ${s.enemiesNear >= 2 ? "mehreren Gegnern" : "Gegnerkontakt"} zurück, statt Druck zu machen.`,
          `Warte an dieser Stelle (${c.when}) auf dein Team, bevor du weiter eindrückst. Schon ein Verbündeter in Reichweite statt ${s.nearestAllyM ?? 30} m entfernt hätte den Kampf offen gemacht.`,
        ], c.n),
      };
    case "isolated":
      return {
        headline: `Allein gegen ${s.enemiesNear} – ${by}`,
        why: `Im Umkreis von ${Math.round(R_NEAR / UNITS_PER_M)} m war kein Verbündeter, aber ${s.enemiesNear} Gegner. ${c.startHp !== null ? `Du bist mit ${pct(c.startHp)} Leben in die Szene gegangen.` : ""}${gain}`,
        advice: `Dieser Kampf war nicht zu gewinnen. Erkenne früher, dass das Team woanders ist${s.teamAwayM !== null ? ` (Schwerpunkt ${s.teamAwayM} m entfernt)` : ""}, und geh dann zum nächsten Verbündeten, statt die Position zu halten.`,
      };
    case "outnumbered":
      return {
        headline: `Unterzahl ${s.alliesNear + 1} gegen ${s.enemiesNear} – ${by}`,
        why: `Auf deiner Seite ${s.alliesNear + 1} im Umkreis, auf der anderen ${s.enemiesNear}. In dieser Überzahl stirbt der, der am ehesten erreichbar ist – das warst du${s.nearestEnemyM !== null ? ` (nächster Gegner nur ${s.nearestEnemyM} m weg)` : ""}.${gain}`,
        advice: `Bevor du in so einen Kampf einsteigst, zähl kurz durch: Du brauchst mindestens so viele Leute wie die Gegner. Bei ${s.enemiesNear - s.alliesNear - 1} fehlenden Mitspielern ist der Rückzug besser als der erste Schuss.`,
      };
    case "lowhp":
      return {
        headline: `Mit wenig Leben im Kampf – ${by}`,
        why: `Sechs Sekunden vorher hattest du nur noch ${pct(c.startHp ?? 0.3)} Leben und bist trotzdem in die Szene geblieben. ${by} haben das ausgenutzt${c.killerHp !== null && c.killerHp < 0.35 ? `, obwohl ${c.killer} selbst nur ${pct(c.killerHp)} hatte` : ""}.`,
        advice: `Unter etwa 40 % Leben ist das Zurückziehen zur Heilung fast immer besser. Der Kill hat sich hier nicht mehr gelohnt – plane den Rückweg, bevor du Schaden nimmst.`,
      };
    case "focus":
      return {
        headline: `Fokussiert von ${c.attackers} Gegnern`,
        why: `${by} haben dich innerhalb von ${c.fightS ?? 3} Sekunden ausgeschaltet${c.hp1 !== null ? ` – eine Sekunde vorher hattest du noch ${pct(c.hp1)}` : ""}. Bei diesem Burst bleibt keine Zeit zum Reagieren.`,
        advice: `Gegen so viel Fokus musst du den Kontakt früher abbrechen: Schon beim ersten Treffer von zwei Gegnern Deckung suchen oder eine Fluchtfähigkeit zünden, nicht erst bei halbem Leben.`,
      };
    case "stayed":
      return {
        headline: `Zu lange im Kampf geblieben – ${by}`,
        why: `Der erste Schaden kam ${c.fightS} Sekunden vor deinem Tod. In der Zeit hättest du mehrfach aussteigen können.${gain}`,
        advice: `Setze dir ein Limit: Wenn dein Leben nach ${Math.max(4, Math.round((c.fightS ?? 8) / 2))} Sekunden Kampf nicht besser ist als das der Gegner, geh raus. Das Leben ist wichtiger als der letzte Treffer.`,
      };
    case "fresh":
      return {
        headline: `Direkt nach dem Respawn gefallen – ${by}`,
        why: `Du warst erst ${c.aliveS} Sekunden wieder im Spiel. ${s.alliesNear === 0 ? "Auf dem Weg zurück war niemand bei dir." : "Das Team war zwar da, aber der Kampf lief schon."}`,
        advice: `Nach dem Respawn lieber mit dem Team zusammen zurückkehren: kurz die Lage prüfen, dann erst in Kämpfe gehen, in denen noch ${s.enemiesNear >= 2 ? "weniger Gegner" : "genug Verbündete"} stehen.`,
      };
    case "teamaway":
      return {
        headline: `Weit vom Team entfernt – ${by}`,
        why: `Dein Team stand im Schnitt ${s.teamAwayM} m weg. Du warst allein unterwegs und wurdest dort erreicht.${gain}`,
        advice: `Allein farmen ist ok, solange du die Gegner kennst: Wenn mehrere Gegner nicht auf der Karte sichtbar sind, halte mehr Abstand zu Engstellen und bleib näher an einer Rückzugsroute.`,
      };
    case "trade":
      return {
        headline: `Getauscht gegen einen Gegner – ${by}`,
        why: `Dein Tod ${c.when} kam nicht umsonst${c.gotKill ? ": du hattest vorher einen Gegner erwischt" : ": dein Team hat direkt danach einen Gegner erwischt"}.`,
        advice: `Solche Tauschkämpfe sind in Ordnung, wenn dein Team sie ausnutzt. Prüfe nur, ob du den Tausch mit mehr Leben hättest gewinnen können.`,
      };
    default:
      return {
        headline: `Kampf verloren – ${by}`,
        why: `${s.alliesNear + 1} gegen ${s.enemiesNear} im Umkreis, ${c.startHp !== null ? `du mit ${pct(c.startHp)} Leben vor der Szene` : "ohne klaren Auslöser"}. ${c.killer} war am Ende schneller.${gain}`,
        advice: `Schau dir die Szene an: Wer hat zuerst Schaden gemacht? Wenn du es warst, hast du den Kampf angenommen – gut. Wenn nicht, fehlt eine Absicherung (Abstand oder Deckung).`,
      };
  }
}
