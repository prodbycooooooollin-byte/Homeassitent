import type { HeroRoleProvider } from "./hero-roles";
import { valueAt } from "./timeline";
import type { ComponentKey, Grade, MatchDetails, MatchPlayer, Rating, RatingComponent, RoleKey, TeamId } from "./types";

/*
 * Rollenbewusstes Performance-Rating
 * ---------------------------------
 * 1. Rolle je Spieler aus dem Verhalten im Match erkennen (nicht aus dem Helden):
 *    Support (viel Heilung/Schilde für Mitspieler), Frontline (viel erlittener/verhinderter Schaden bei wenig eigenem
 *    Schaden), Objective-Fokus, Carry (überdurchschnittlicher Schaden) oder Flex.
 * 2. Jeder Baustein wird mit Spielern GLEICHER Rolle (beider Teams) und der restlichen Lobby verglichen – ein Support
 *    wird bei Kills/Schaden also mit anderen Supports verglichen, nicht mit einem Carry.
 * 3. Die Bausteine werden je nach Rolle unterschiedlich gewichtet (Support: Unterstützung, Beteiligung, Überleben;
 *    Carry: Kampf, Wirtschaft, Überleben …). Nicht anwendbare Bausteine fallen weg, die Gewichte werden neu verteilt.
 * 4. Logarithmische Skala: doppelt so gut wie der Vergleich ist symmetrisch zu halb so gut.
 */

/** Ohne Vorwissen zum Helden (z. B. im Browser oder in Tests) entscheidet allein das Verhalten. */
const noPrior: HeroRoleProvider = () => null;

export const COMPONENT_ORDER: ComponentKey[] = ["combat", "utility", "participation", "survival", "economy", "objectives", "lane"];
export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  combat: "Kampf", utility: "Support / Frontline", participation: "Beteiligung", survival: "Überleben", economy: "Wirtschaft", objectives: "Objectives", lane: "Lane",
};
export const ROLE_LABELS: Record<RoleKey, string> = { carry: "Carry / Damage", support: "Support", tank: "Frontline", pusher: "Objective-Fokus", flex: "Flex" };

/** Rollen-Gewichte (werden über die anwendbaren Bausteine neu normiert). */
export const ROLE_WEIGHTS: Record<RoleKey, Partial<Record<ComponentKey, number>>> = {
  carry:   { combat: 0.28, participation: 0.14, survival: 0.16, economy: 0.18, objectives: 0.08, lane: 0.16 },
  support: { utility: 0.30, participation: 0.20, survival: 0.18, combat: 0.08, economy: 0.08, objectives: 0.04, lane: 0.12 },
  tank:    { utility: 0.26, participation: 0.18, survival: 0.12, combat: 0.14, economy: 0.08, objectives: 0.08, lane: 0.14 },
  pusher:  { objectives: 0.26, combat: 0.16, economy: 0.16, participation: 0.12, survival: 0.14, lane: 0.16 },
  flex:    { combat: 0.22, participation: 0.18, survival: 0.16, economy: 0.16, objectives: 0.08, lane: 0.12 },
};

/** Grenzen der Noten (Score 1.0 = durchschnittlich). */
export const GRADE_STEPS: [number, Grade][] = [
  [1.30, "S"], [1.14, "A"], [0.97, "B"], [0.83, "C"], [0.69, "D"], [-Infinity, "F"],
];
export function gradeFor(score: number): Grade {
  for (const [min, g] of GRADE_STEPS) if (score >= min) return g;
  return "F";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/** Verhältnis → Score: 1.0 bei gleichem Wert, symmetrisch in log-Skala, begrenzt auf ~0.1–1.9. */
export function ratioScore(r: number): number {
  return 1 + 0.9 * Math.tanh(1.1 * Math.log(clamp(r, 0.15, 6)));
}

interface Metrics { p: MatchPlayer; dmg: number; util: number; tank: number; obj: number; souls: number; deaths: number; kp: number; utilExact: boolean }

function metricsFor(d: MatchDetails): Metrics[] {
  const mins = Math.max(1, d.durationS / 60);
  const teamKills = [0, 1].map((t) => d.players.filter((p) => p.team === t).reduce((a, p) => a + p.kills, 0));
  return d.players.map((p) => ({
    p,
    dmg: p.heroDamage / mins,
    // Nur Heilung/Schilde, die an MITSPIELER gingen. Eigenheilung (Lifesteal durch Schaden) ist kein Support-Signal und
    // wird nie herangezogen – fehlen die Daten, ist der Wert 0 und die Rolle kann nicht aus Heilung abgeleitet werden.
    util: (p.allyHealing ?? 0) / mins,
    tank: (p.damageTaken + (p.mitigated ?? 0)) / mins,
    obj: p.objectiveDamage / mins,
    souls: p.netWorth / mins,
    deaths: p.deaths / mins,
    kp: (p.kills + p.assists) / Math.max(1, teamKills[p.team]),
    utilExact: p.allyHealing !== undefined,
  }));
}

export interface RoleInfo { key: RoleKey; reason: string }

/**
 * Rolle jedes Spielers. Zwei Quellen, die sich ergänzen:
 *  - Vorwissen zum Helden (z. B. Paige = Support) aus den Spieldaten,
 *  - Verhalten im Match (Heilung/Schilde für Mitspieler, erlittener Schaden, Schaden, Objectives).
 * Support braucht Belege: entweder eine Support-Heldenrolle (die nur bei klar gegenteiligem Verhalten überstimmt wird)
 * oder sehr deutliche Mitspieler-Unterstützung bei gleichzeitig nicht überdurchschnittlichem Schaden.
 */
export function classifyRoles(d: MatchDetails, prior: HeroRoleProvider = noPrior): Map<number, RoleInfo> {
  const ms = metricsFor(d);
  const mu = { util: mean(ms.map((m) => m.util)), tank: mean(ms.map((m) => m.tank)), dmg: mean(ms.map((m) => m.dmg)), obj: mean(ms.map((m) => m.obj)) };
  const teamUtil = [0, 1].map((t) => ms.filter((m) => m.p.team === t).reduce((a, m) => a + m.util, 0));
  const out = new Map<number, RoleInfo>();
  for (const m of ms) {
    const utilRel = mu.util > 0 ? m.util / mu.util : 0;
    const share = teamUtil[m.p.team] > 0 ? m.util / teamUtil[m.p.team] : 0;
    const dmgRel = mu.dmg > 0 ? m.dmg / mu.dmg : 1;
    const tankRel = mu.tank > 0 ? m.tank / mu.tank : 1;
    const objRel = mu.obj > 0 ? m.obj / mu.obj : 1;
    const hero = prior(m.p.heroId);
    const supportBehaviour = m.utilExact && utilRel >= 1.8 && share >= 0.4 && m.util >= 150;
    let role: RoleInfo;
    if (hero === "support" && !(m.utilExact && dmgRel >= 1.5 && utilRel < 1)) {
      role = { key: "support", reason: `dieser Held ist ein Support${supportBehaviour ? `; dazu ${utilRel.toFixed(1)}× so viel Unterstützung für Mitspieler wie der Lobby-Schnitt` : ""}` };
    } else if (supportBehaviour && dmgRel < 1.1 && (hero === null || utilRel >= 3)) {
      role = { key: "support", reason: `${utilRel.toFixed(1)}× so viel Heilung/Schilde für Mitspieler wie der Lobby-Schnitt (${Math.round(share * 100)}% der Team-Unterstützung) bei unterdurchschnittlichem Schaden` };
    } else if (objRel >= 2.2 && dmgRel < 1.3) {
      role = { key: "pusher", reason: `${objRel.toFixed(1)}× so viel Objective-Schaden wie der Lobby-Schnitt` };
    } else if (hero === "tank" ? dmgRel < 1.35 : tankRel >= 1.35 && dmgRel <= 1.0) {
      role = { key: "tank", reason: hero === "tank" ? "Frontline-Held mit Fokus auf Aufnehmen von Schaden" : `${tankRel.toFixed(1)}× so viel erlittener/verhinderter Schaden bei unterdurchschnittlichem eigenem Schaden` };
    } else if (dmgRel >= 1.08 || (hero === "carry" && dmgRel >= 0.85)) {
      role = { key: "carry", reason: `${dmgRel.toFixed(1)}× so viel Heldenschaden wie der Lobby-Schnitt` };
    } else {
      role = { key: "flex", reason: "kein klarer Schwerpunkt (Schaden, Unterstützung und Frontline jeweils im Schnitt)" };
    }
    out.set(m.p.accountId, role);
  }
  return out;
}

/** Vergleichswert: Mittel der Spieler gleicher Rolle (ohne den Spieler selbst), mit der restlichen Lobby verblendet. */
function baseline(all: Metrics[], me: Metrics, peers: Metrics[], f: (m: Metrics) => number): number {
  const others = all.filter((m) => m !== me);
  const lobby = mean(others.map(f));
  if (!peers.length) return lobby;
  // Mit mindestens zwei Rollen-Peers zählen diese klar am meisten, mit einem Peer etwas weniger (mehr Rauschen).
  const w = peers.length >= 2 ? 0.85 : 0.65;
  return w * mean(peers.map(f)) + (1 - w) * lobby;
}

const LANE_AT_S = 480;

/** Vollständige, erklärbare Bewertung eines Spielers. */
export function ratePlayer(match: MatchDetails, accountId: number, prior: HeroRoleProvider = noPrior): Rating | null {
  const all = metricsFor(match);
  const me = all.find((m) => m.p.accountId === accountId);
  if (!me || all.length < 2) return null;
  const roles = classifyRoles(match, prior);
  const role = roles.get(accountId)!;
  const peers = all.filter((m) => m !== me && roles.get(m.p.accountId)?.key === role.key);
  const mins = Math.max(1, match.durationS / 60);
  const notes: string[] = [];
  const raw: Record<ComponentKey, { ratio: number | null; detail: string }> = {} as never;

  // Kampf
  const bDmg = baseline(all, me, peers, (m) => m.dmg);
  raw.combat = bDmg > 0 ? { ratio: me.dmg / bDmg, detail: `${fmtK(me.p.heroDamage)} Heldenschaden (Vergleich Ø ${fmtK(bDmg * mins)})` } : { ratio: null, detail: "" };

  // Support / Frontline – nur für diese Rollen anwendbar, und nur im Vergleich mit Spielern GLEICHER Rolle:
  // die übrige Lobby heilt/tankt kaum, ein Vergleich mit ihr würde jeden Support automatisch glänzen lassen.
  const utilOf = (m: Metrics) => (role.key === "support" ? m.util : m.tank);
  if (role.key === "support" || role.key === "tank") {
    const unit = role.key === "support" ? "Heilung/Schilde für Mitspieler" : "erlittener + verhinderter Schaden";
    const mine = utilOf(me);
    if (role.key === "support" && !me.utilExact) {
      raw.utility = { ratio: null, detail: "" };
      notes.push("Für dieses Match liegen keine Daten zu Heilung/Schilden für Mitspieler vor – der Support-Baustein entfällt, Beteiligung und Überleben zählen stärker.");
    } else if (peers.length) {
      const b = mean(peers.map(utilOf));
      // Ein einzelner Vergleichsspieler ist ein rauschiger Maßstab (1-gegen-1) – das Verhältnis wird dann zur Mitte hin gedämpft.
      raw.utility = b > 0 ? { ratio: Math.pow(mine / b, peers.length >= 2 ? 1 : 0.65), detail: `${fmtK(mine * mins)} ${unit} (Vergleich Ø ${fmtK(b * mins)} bei ${peers.length} ${peers.length === 1 ? "Spieler gleicher Rolle – Abweichung gedämpft" : "Spielern gleicher Rolle"})` } : { ratio: null, detail: "" };
    } else {
      // Keine Vergleichsspieler gleicher Rolle: Wert nur mäßig positiv einordnen statt gegen Nicht-Supports zu feiern.
      const top = Math.max(0, ...all.filter((m) => m !== me).map(utilOf));
      raw.utility = { ratio: top > 0 ? clamp(mine / top, 0.6, 1.4) : 1.2, detail: `${fmtK(mine * mins)} ${unit} (keine Vergleichsspieler gleicher Rolle – nur eingeschränkt bewertet)` };
    }
  } else raw.utility = { ratio: null, detail: "" };

  // Beteiligung
  const bKp = baseline(all, me, peers, (m) => m.kp);
  raw.participation = bKp > 0 ? { ratio: me.kp / bKp, detail: `${me.p.kills} Kills + ${me.p.assists} Assists = ${Math.round(me.kp * 100)}% der Team-Kills (Vergleich Ø ${Math.round(bKp * 100)}%)` } : { ratio: null, detail: "" };

  // Überleben (weniger Tode pro Minute = besser)
  const bDeaths = baseline(all, me, peers, (m) => m.deaths);
  raw.survival = { ratio: (bDeaths + 0.02) / (me.deaths + 0.02), detail: `${me.p.deaths} Tode (Vergleich Ø ${(bDeaths * mins).toFixed(1)})${me.p.deadTimeS ? `, ${Math.round(me.p.deadTimeS / 60)} Min. tot` : ""}` };

  // Wirtschaft
  const bSouls = baseline(all, me, peers, (m) => m.souls);
  raw.economy = bSouls > 0 ? { ratio: me.souls / bSouls, detail: `${fmtK(me.p.netWorth)} Souls = ${Math.round(me.souls)}/Min (Vergleich Ø ${Math.round(bSouls)}/Min)` } : { ratio: null, detail: "" };

  // Objectives
  const bObj = baseline(all, me, peers, (m) => m.obj);
  raw.objectives = bObj > 0 ? { ratio: me.obj / bObj, detail: `${fmtK(me.p.objectiveDamage)} Objective-Schaden (Vergleich Ø ${fmtK(bObj * mins)})` } : { ratio: null, detail: "" };

  // Lane: eigene Souls nach 8:00 gegen die Gegner derselben Lane
  raw.lane = { ratio: null, detail: "" };
  if (me.p.timeline && me.p.lane && match.durationS >= 600) {
    const opp = match.players.filter((p) => p.team !== me.p.team && p.lane === me.p.lane && p.timeline);
    if (opp.length) {
      const mine = valueAt(me.p.timeline as never, "nw", LANE_AT_S);
      const theirs = mean(opp.map((p) => valueAt(p.timeline as never, "nw", LANE_AT_S)));
      raw.lane = { ratio: (mine + 300) / (theirs + 300), detail: `${fmtK(mine)} Souls nach 8:00 gegen Ø ${fmtK(theirs)} der Gegner auf deiner Lane` };
    }
  }

  // Gewichte über anwendbare Bausteine normieren
  const base = ROLE_WEIGHTS[role.key];
  const applicable = COMPONENT_ORDER.filter((k) => raw[k].ratio !== null && (base[k] ?? 0) > 0);
  const total = applicable.reduce((a, k) => a + (base[k] ?? 0), 0) || 1;
  const components: RatingComponent[] = COMPONENT_ORDER.map((k) => {
    const ok = applicable.includes(k);
    const ratio = raw[k].ratio;
    const score = ratio === null ? 1 : ratioScore(ratio);
    const weight = ok ? (base[k] ?? 0) / total : 0;
    return { key: k, label: COMPONENT_LABELS[k], ratio: ratio === null ? null : Math.round(ratio * 100) / 100, score: Math.round(score * 100) / 100, weight: Math.round(weight * 1000) / 1000, contribution: Math.round(score * weight * 1000) / 1000, applicable: ok, detail: raw[k].detail };
  });
  let score = applicable.reduce((a, k) => a + ratioScore(raw[k].ratio as number) * ((base[k] ?? 0) / total), 0);

  // Kurze Matches sind weniger aussagekräftig: Note zum Durchschnitt hin dämpfen
  const reliability = clamp((mins - 6) / 12, 0.25, 1);
  if (reliability < 1) {
    score = 1 + (score - 1) * reliability;
    notes.push(`Kurzes Match (${Math.round(mins)} Min.): Die Note wurde zum Durchschnitt hin gedämpft, weil wenig Spielzeit vorlag.`);
  }

  // Ergebnis
  let bonus: Rating["bonus"] = null;
  if (match.winningTeam !== null) {
    const won = match.winningTeam === me.p.team;
    bonus = { label: won ? "Sieg" : "Niederlage", value: won ? 0.04 : -0.04 };
    score += bonus.value;
  }
  if (!applicable.includes("lane")) notes.push("Keine Lane-Daten für dieses Match – Gewicht auf die übrigen Bausteine verteilt.");

  // Rollenerklärung
  const peerTxt = peers.length ? `Verglichen mit ${peers.length} ${peers.length === 1 ? "Spieler" : "Spielern"} gleicher Rolle und der restlichen Lobby.` : "Keine Spieler gleicher Rolle im Match – Vergleich mit der gesamten Lobby.";
  notes.unshift(`Rolle erkannt: ${ROLE_LABELS[role.key]} (${role.reason}). ${peerTxt}`);
  if (role.key === "support") notes.push("Als Support zählen Unterstützung, Beteiligung und Überleben am stärksten; Kills, Schaden und Souls werden nur gering gewichtet und mit anderen Supports verglichen.");
  if (role.key === "tank") notes.push("Als Frontline zählen Aufnehmen/Verhindern von Schaden und Beteiligung stärker als eigene Kills.");
  if (role.key === "pusher") notes.push("Beim Objective-Fokus zählt der Schaden an Gebäuden und Bossen am stärksten.");

  score = Math.round(score * 100) / 100;
  const grade: Grade = me.p.abandoned ? "F" : gradeFor(score);
  if (me.p.abandoned) notes.push("Match vorzeitig verlassen – automatisch Note F.");

  return {
    grade, score,
    role: { key: role.key, label: ROLE_LABELS[role.key], reason: role.reason },
    components, bonus, notes,
    parts: components.map((c) => (c.applicable ? c.score : 1)),
  };
}

export type { TeamId };
